use std::time::Duration;

use crate::errors::AidError;
use crate::parser::parse;
use crate::record::AidRecord;
use crate::constants_gen::{SPEC_VERSION_V1, SPEC_VERSION_V2};
use hickory_resolver::TokioAsyncResolver;
use idna::domain_to_ascii;

#[cfg(feature = "handshake")]
use crate::pka::perform_pka_handshake;

#[cfg(feature = "handshake")]
use crate::well_known::fetch_well_known;

/// Discover an AID record for the given domain using DNS TXT at _agent.<domain>.
/// Falls back to HTTPS .well-known when DNS has no record or lookup fails.
pub async fn discover(domain: &str, timeout: Duration) -> Result<AidRecord, AidError> {
    let opts = DiscoveryOptions { protocol: None, timeout, well_known_fallback: true, well_known_timeout: Duration::from_secs(2) };
    discover_with_options(domain, opts).await
}

pub struct DiscoveryOptions {
    pub protocol: Option<String>,
    pub timeout: Duration,
    pub well_known_fallback: bool,
    pub well_known_timeout: Duration,
}

fn looks_like_aid_record(raw: &str) -> bool {
    let lower = raw.to_ascii_lowercase();
    lower.starts_with("v=aid")
        || lower.starts_with("version=aid")
        || lower.contains(";v=aid")
        || lower.contains(";version=aid")
}

fn select_supported_record(records: Vec<AidRecord>, query_name: &str) -> Result<AidRecord, AidError> {
    let selected_version = if records.iter().any(|record| record.v == SPEC_VERSION_V2) {
        SPEC_VERSION_V2
    } else {
        SPEC_VERSION_V1
    };
    let mut selected = records
        .into_iter()
        .filter(|record| record.v == selected_version)
        .collect::<Vec<_>>();
    if selected.len() == 1 {
        return Ok(selected.remove(0));
    }
    Err(AidError::new(
        "ERR_INVALID_TXT",
        format!(
            "Multiple valid {} AID records found for {}; publish exactly one valid record per queried DNS name",
            selected_version, query_name
        ),
    ))
}

fn select_from_txt_answers(raw_records: Vec<String>, query_name: &str) -> Result<Option<AidRecord>, AidError> {
    let mut valid: Vec<AidRecord> = Vec::new();
    let mut parse_err: Option<AidError> = None;
    for raw_record in raw_records {
        let raw = raw_record.trim();
        if !looks_like_aid_record(raw) {
            continue;
        }
        match parse(raw) {
            Ok(rec) => valid.push(rec),
            Err(err) => {
                parse_err = Some(err);
            }
        }
    }
    if !valid.is_empty() {
        return Ok(Some(select_supported_record(valid, query_name)?));
    }
    if let Some(err) = parse_err {
        return Err(err);
    }
    Ok(None)
}

pub async fn discover_with_options(domain: &str, options: DiscoveryOptions) -> Result<AidRecord, AidError> {
    // IDNA → A-label
    let alabel = domain_to_ascii(domain).unwrap_or_else(|_| domain.to_string());
    let mut names: Vec<String> = Vec::new();
    if let Some(proto) = &options.protocol {
        names.push(format!("_agent._{}.{}", proto, alabel));
        names.push(format!("_agent.{}.{}", proto, alabel));
    }
    names.push(format!("_agent.{}", alabel));

    // DNS lookup using system resolver
    let resolver = TokioAsyncResolver::tokio_from_system_conf()
        .map_err(|e| AidError::new("ERR_DNS_LOOKUP_FAILED", e.to_string()))?;

    // iterate names
    let mut last_err: Option<AidError> = None;
    for name in names {
        let txt_lookup = tokio::time::timeout(options.timeout, resolver.txt_lookup(name.clone())).await;
        match txt_lookup {
            Err(_) => {
                last_err = Some(AidError::new("ERR_DNS_LOOKUP_FAILED", "DNS query timeout"));
                break;
            }
            Ok(Err(e)) => {
                let msg = e.to_string().to_lowercase();
                let code = if msg.contains("nxdomain") || msg.contains("no record") || msg.contains("no data") { "ERR_NO_RECORD" } else { "ERR_DNS_LOOKUP_FAILED" };
                let err = AidError::new(code, e.to_string());
                if code != "ERR_NO_RECORD" { last_err = Some(err); break; }
                last_err = Some(err);
                continue;
            }
            Ok(Ok(lookup)) => {
                let raw_records = lookup
                    .iter()
                    .map(|r| {
                        r.txt_data()
                            .iter()
                            .map(|b| String::from_utf8_lossy(b).to_string())
                            .collect::<Vec<_>>()
                            .join("")
                    })
                    .collect::<Vec<_>>();
                if let Some(rec) = select_from_txt_answers(raw_records, &name)? {
                    #[cfg(feature = "handshake")]
                    {
                        if let Some(pka) = rec.pka.clone() {
                            if rec.v == SPEC_VERSION_V1 {
                                perform_pka_handshake(&rec.uri, &pka, rec.kid.as_deref().unwrap_or(""), options.timeout).await?;
                            } else {
                                perform_pka_handshake(&rec.uri, &pka, "", options.timeout).await?;
                            }
                        }
                    }
                    return Ok(rec);
                }
                last_err = Some(AidError::new("ERR_NO_RECORD", format!("No valid AID record found for {}", name)));
                continue;
            }
        }
    }

    // Fallback
    if options.well_known_fallback {
        #[cfg(feature = "handshake")]
        {
            return fetch_well_known(&alabel, options.well_known_timeout).await;
        }
    }
    Err(last_err.unwrap_or_else(|| AidError::new("ERR_DNS_LOOKUP_FAILED", "DNS query failed")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_records(raw: &[&str]) -> Vec<AidRecord> {
        raw.iter().filter_map(|txt| parse(txt).ok()).collect()
    }

    #[test]
    fn selection_prefers_single_valid_aid2_over_aid1() {
        let records = valid_records(&[
            "v=aid1;u=https://example.com/v1;p=mcp",
            "v=aid2;u=https://example.com/v2;p=mcp",
        ]);

        let selected = select_supported_record(records, "_agent.example.com").expect("select aid2");
        assert_eq!(selected.v, SPEC_VERSION_V2);
        assert_eq!(selected.uri, "https://example.com/v2");
    }

    #[test]
    fn selection_rejects_multiple_valid_aid2_records() {
        let records = valid_records(&[
            "v=aid1;u=https://example.com/v1;p=mcp",
            "v=aid2;u=https://example.com/a;p=mcp",
            "v=aid2;u=https://example.com/b;p=mcp",
        ]);

        let err = select_supported_record(records, "_agent.example.com").expect_err("multiple aid2 records fail");
        assert_eq!(err.error_code, "ERR_INVALID_TXT");
        assert!(err.message.contains("Multiple valid aid2 AID records"));
    }

    #[test]
    fn selection_uses_valid_aid1_when_aid2_is_malformed() {
        let selected = select_from_txt_answers(
            vec![
                "v=aid1;u=https://example.com/v1;p=mcp".to_string(),
                "v=aid2;u=https://example.com/v2;p=mcp;k=zLegacy;i=stale".to_string(),
            ],
            "_agent.example.com",
        )
        .expect("valid aid1 should be selected");

        assert_eq!(selected.expect("record").v, SPEC_VERSION_V1);
    }

    #[test]
    fn selection_uses_valid_aid2_when_another_aid2_is_malformed() {
        let selected = select_from_txt_answers(
            vec![
                "v=aid2;u=https://example.com/v2;p=mcp;k=zLegacy;i=stale".to_string(),
                "v=aid2;u=https://example.com/good;p=mcp".to_string(),
            ],
            "_agent.example.com",
        )
        .expect("valid aid2 should be selected")
        .expect("record");

        assert_eq!(selected.v, SPEC_VERSION_V2);
        assert_eq!(selected.uri, "https://example.com/good");
    }

    #[test]
    fn selection_rejects_malformed_aid_records_instead_of_no_record() {
        let err = select_from_txt_answers(
            vec!["v=aid1;u=http://bad.example.com;p=mcp".to_string()],
            "_agent.example.com",
        )
        .expect_err("malformed aid-like TXT must fail");

        assert_eq!(err.error_code, "ERR_INVALID_TXT");
    }

    #[test]
    fn selection_rejects_unknown_aid_like_version_instead_of_no_record() {
        let err = select_from_txt_answers(
            vec!["v=aid3;u=https://future.example.com;p=mcp".to_string()],
            "_agent.example.com",
        )
        .expect_err("unknown aid-like TXT must fail");

        assert_eq!(err.error_code, "ERR_INVALID_TXT");
    }

    #[test]
    fn selection_ignores_non_aid_txt_records() {
        let selected = select_from_txt_answers(
            vec!["google-site-verification=abc".to_string()],
            "_agent.example.com",
        )
        .expect("non-aid TXT is not invalid");

        assert!(selected.is_none());
    }
}
