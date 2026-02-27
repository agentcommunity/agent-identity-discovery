use std::time::Duration;

use crate::errors::AidError;
use crate::parser::parse;
use crate::record::AidRecord;
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
    lower.starts_with("v=aid1")
        || lower.starts_with("version=aid1")
        || lower.contains(";v=aid1")
        || lower.contains(";version=aid1")
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
                let mut valid: Option<AidRecord> = None;
                let mut valid_count = 0usize;
                for r in lookup.iter() {
                    let s = r.txt_data().iter().map(|b| String::from_utf8_lossy(b).to_string()).collect::<Vec<_>>().join("");
                    let raw = s.trim();
                    if !looks_like_aid_record(raw) {
                        continue;
                    }
                    if let Ok(rec) = parse(raw) {
                        valid = Some(rec);
                        valid_count += 1;
                    }
                }
                if valid_count == 1 {
                    let rec = valid.expect("single valid record must exist");
                    #[cfg(feature = "handshake")]
                    {
                        if let (Some(pka), Some(kid)) = (rec.pka.clone(), rec.kid.clone()) {
                            perform_pka_handshake(&rec.uri, &pka, &kid, options.timeout).await?;
                        }
                    }
                    return Ok(rec);
                }
                if valid_count > 1 {
                    last_err = Some(AidError::new(
                        "ERR_INVALID_TXT",
                        format!(
                            "Multiple valid AID records found for {}; publish exactly one valid record per queried DNS name",
                            name
                        ),
                    ));
                    break;
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
