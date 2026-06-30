use std::time::Duration;

use crate::constants_gen::{SPEC_VERSION_V1, SPEC_VERSION_V2};
use crate::errors::AidError;
use crate::parser::parse;
use crate::record::AidRecord;
use hickory_resolver::TokioAsyncResolver;
use idna::domain_to_ascii;

use crate::well_known::{fetch_well_known_result, verify_domain_bound_for_record};

/// Discover an AID record for the given domain using DNS TXT at _agent.<domain>.
/// Falls back to HTTPS .well-known when DNS has no record or lookup fails.
pub async fn discover(domain: &str, timeout: Duration) -> Result<AidRecord, AidError> {
    let opts = DiscoveryOptions {
        protocol: None,
        timeout,
        well_known_fallback: true,
        well_known_timeout: Duration::from_secs(2),
    };
    Ok(discover_with_options_result(domain, opts).await?.record)
}

pub struct DiscoveryOptions {
    pub protocol: Option<String>,
    pub timeout: Duration,
    pub well_known_fallback: bool,
    pub well_known_timeout: Duration,
}

/// Result returned by discovery when callers need verification metadata.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DiscoveryResult {
    pub record: AidRecord,
    pub query_name: String,
    /// True only when a v2 PKA handshake returned a verified domain-bound proof.
    pub domain_bound: bool,
}

fn looks_like_aid_record(raw: &str) -> bool {
    let lower = raw.to_ascii_lowercase();
    lower.starts_with("v=aid")
        || lower.starts_with("version=aid")
        || lower.contains(";v=aid")
        || lower.contains(";version=aid")
}

fn select_supported_record(
    records: Vec<AidRecord>,
    query_name: &str,
) -> Result<AidRecord, AidError> {
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

fn select_from_txt_answers(
    raw_records: Vec<String>,
    query_name: &str,
) -> Result<Option<AidRecord>, AidError> {
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

fn discovery_query_names(alabel: &str, protocol: Option<&str>) -> Vec<String> {
    let mut names = Vec::new();
    if let Some(proto) = protocol {
        names.push(format!("_agent._{}.{}", proto, alabel));
    }
    names.push(format!("_agent.{}", alabel));
    names
}

pub async fn discover_with_options(
    domain: &str,
    options: DiscoveryOptions,
) -> Result<AidRecord, AidError> {
    Ok(discover_with_options_result(domain, options).await?.record)
}

/// Discover an AID record and return verification metadata such as v2 PKA domain binding.
pub async fn discover_result(domain: &str, timeout: Duration) -> Result<DiscoveryResult, AidError> {
    let opts = DiscoveryOptions {
        protocol: None,
        timeout,
        well_known_fallback: true,
        well_known_timeout: Duration::from_secs(2),
    };
    discover_with_options_result(domain, opts).await
}

/// Discover with explicit options and return verification metadata.
pub async fn discover_with_options_result(
    domain: &str,
    options: DiscoveryOptions,
) -> Result<DiscoveryResult, AidError> {
    // IDNA → A-label
    let alabel = domain_to_ascii(domain).unwrap_or_else(|_| domain.to_string());
    let names = discovery_query_names(&alabel, options.protocol.as_deref());

    // DNS lookup using system resolver
    let resolver = TokioAsyncResolver::tokio_from_system_conf()
        .map_err(|e| AidError::new("ERR_DNS_LOOKUP_FAILED", e.to_string()))?;

    // iterate names
    let mut last_err: Option<AidError> = None;
    for name in names {
        let txt_lookup =
            tokio::time::timeout(options.timeout, resolver.txt_lookup(name.clone())).await;
        match txt_lookup {
            Err(_) => {
                last_err = Some(AidError::new("ERR_DNS_LOOKUP_FAILED", "DNS query timeout"));
                break;
            }
            Ok(Err(e)) => {
                let msg = e.to_string().to_lowercase();
                let code = if msg.contains("nxdomain")
                    || msg.contains("no record")
                    || msg.contains("no data")
                {
                    "ERR_NO_RECORD"
                } else {
                    "ERR_DNS_LOOKUP_FAILED"
                };
                let err = AidError::new(code, e.to_string());
                if code != "ERR_NO_RECORD" {
                    last_err = Some(err);
                    break;
                }
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
                    return finish_discovered_record(rec, &name, &alabel, options.timeout).await;
                }
                last_err = Some(AidError::new(
                    "ERR_NO_RECORD",
                    format!("No valid AID record found for {}", name),
                ));
                continue;
            }
        }
    }

    // Fallback to HTTPS .well-known. The fetch works under default features; the PKA
    // handshake it performs (if the record carries a key) is only enforced when the
    // `handshake` feature is enabled. This matches Go/Python, where fallback is
    // unconditional and not behind a build feature.
    if options.well_known_fallback {
        let result = fetch_well_known_result(&alabel, options.well_known_timeout).await?;
        return Ok(DiscoveryResult {
            record: result.record,
            query_name: format!("https://{}/.well-known/agent", alabel),
            domain_bound: result.domain_bound,
        });
    }
    Err(last_err.unwrap_or_else(|| AidError::new("ERR_DNS_LOOKUP_FAILED", "DNS query failed")))
}

async fn finish_discovered_record(
    record: AidRecord,
    query_name: &str,
    binding_domain: &str,
    timeout: Duration,
) -> Result<DiscoveryResult, AidError> {
    let domain_bound = verify_domain_bound_for_record(&record, binding_domain, timeout).await?;
    Ok(DiscoveryResult {
        record,
        query_name: query_name.to_string(),
        domain_bound,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_records(raw: &[&str]) -> Vec<AidRecord> {
        raw.iter().filter_map(|txt| parse(txt).ok()).collect()
    }

    #[test]
    fn protocol_query_names_use_underscore_then_base() {
        assert_eq!(
            discovery_query_names("example.com", Some("mcp")),
            vec![
                "_agent._mcp.example.com".to_string(),
                "_agent.example.com".to_string()
            ]
        );
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

        let err = select_supported_record(records, "_agent.example.com")
            .expect_err("multiple aid2 records fail");
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

    #[tokio::test]
    async fn finished_discovery_result_defaults_domain_bound_false_without_pka() {
        let record = parse("v=aid2;u=https://example.com/mcp;p=mcp").expect("valid aid2");

        let result = finish_discovered_record(
            record,
            "_agent.example.com",
            "example.com",
            Duration::from_secs(1),
        )
        .await
        .expect("finish result");

        assert_eq!(result.record.uri, "https://example.com/mcp");
        assert_eq!(result.query_name, "_agent.example.com");
        assert!(!result.domain_bound);
    }

    #[cfg(feature = "handshake")]
    mod domain_bound_tests {
        use super::*;
        use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
        use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
        use sha2::Digest;
        use std::io::{Read, Write};
        use std::net::TcpListener;
        use std::thread;

        fn v2_test_key() -> (SigningKey, String) {
            let seed = [7u8; 32];
            let sk = SigningKey::from_bytes(&seed);
            let vk = VerifyingKey::from(&sk);
            let k = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(vk.as_bytes());
            (sk, k)
        }

        fn header_value<'a>(request: &'a str, name: &str) -> Option<&'a str> {
            request.lines().find_map(|line| {
                let (key, value) = line.split_once(':')?;
                if key.eq_ignore_ascii_case(name) {
                    Some(value.trim())
                } else {
                    None
                }
            })
        }

        fn nonce_from_accept_signature(value: &str) -> String {
            let marker = "nonce=\"";
            let start = value.find(marker).expect("nonce parameter") + marker.len();
            let rest = &value[start..];
            let end = rest.find('"').expect("nonce closing quote");
            rest[..end].to_string()
        }

        fn derive_v2_keyid(pka: &str) -> String {
            let jwk = format!("{{\"crv\":\"Ed25519\",\"kty\":\"OKP\",\"x\":\"{}\"}}", pka);
            let digest = sha2::Sha256::digest(jwk.as_bytes());
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
        }

        fn sign_v2_response(
            sk: &SigningKey,
            keyid: &str,
            target_uri: &str,
            authority: &str,
            status: u16,
            nonce: &str,
            aid_domain: Option<&str>,
        ) -> (String, String) {
            let created = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time")
                .as_secs() as i64;
            let expires = created + 60;
            let covered = if aid_domain.is_some() {
                "(\"@method\";req \"@target-uri\";req \"@authority\";req \"aid-domain\";req \"@status\")"
            } else {
                "(\"@method\";req \"@target-uri\";req \"@authority\";req \"@status\")"
            };
            let signature_params_raw = format!(
                "{};created={};expires={};keyid=\"{}\";alg=\"ed25519\";nonce=\"{}\";tag=\"aid-pka-v2\"",
                covered, created, expires, keyid, nonce
            );
            let mut lines = vec![
                "\"@method\";req: GET".to_string(),
                format!("\"@target-uri\";req: {}", target_uri),
                format!("\"@authority\";req: {}", authority),
            ];
            if let Some(domain) = aid_domain {
                lines.push(format!("\"aid-domain\";req: {}", domain));
            }
            lines.push(format!("\"@status\": {}", status));
            lines.push(format!("\"@signature-params\": {}", signature_params_raw));
            let signature = sk.sign(lines.join("\n").as_bytes());
            (
                format!("aid-pka={}", signature_params_raw),
                format!("aid-pka=:{}:", B64.encode(signature.to_bytes())),
            )
        }

        fn spawn_v2_pka_server(sk: SigningKey, keyid: String, bind_response: bool) -> String {
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
            let address = listener.local_addr().expect("local addr");
            let url = format!("http://{}/mcp", address);
            let response_target_uri = url.clone();
            thread::spawn(move || {
                let (mut stream, _) = listener.accept().expect("accept request");
                let mut buffer = [0u8; 8192];
                let bytes_read = stream.read(&mut buffer).expect("read request");
                let request = String::from_utf8_lossy(&buffer[..bytes_read]);
                let accept_signature =
                    header_value(&request, "Accept-Signature").expect("Accept-Signature");
                let nonce = nonce_from_accept_signature(accept_signature);
                let aid_domain = header_value(&request, "AID-Domain");
                let signed_domain = if bind_response { aid_domain } else { None };
                let status = 401;
                let (sig_input, sig_header) = sign_v2_response(
                    &sk,
                    &keyid,
                    &response_target_uri,
                    &address.to_string(),
                    status,
                    &nonce,
                    signed_domain,
                );
                let response = format!(
                    "HTTP/1.1 {} Unauthorized\r\nCache-Control: no-store\r\nSignature-Input: {}\r\nSignature: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                    status, sig_input, sig_header
                );
                stream
                    .write_all(response.as_bytes())
                    .expect("write response");
            });
            url
        }

        #[tokio::test]
        async fn finished_discovery_result_surfaces_domain_bound_true_for_v2_pka() {
            let (sk, pka) = v2_test_key();
            let keyid = derive_v2_keyid(&pka);
            let uri = spawn_v2_pka_server(sk, keyid, true);
            let record = AidRecord {
                v: SPEC_VERSION_V2.to_string(),
                uri,
                proto: "mcp".to_string(),
                auth: None,
                desc: None,
                docs: None,
                dep: None,
                pka: Some(pka),
                kid: None,
            };

            let result = finish_discovered_record(
                record,
                "_agent.example.com",
                "Example.COM.",
                Duration::from_secs(2),
            )
            .await
            .expect("finish result");

            assert!(result.domain_bound);
        }

        #[tokio::test]
        async fn finished_discovery_result_surfaces_domain_bound_false_for_unbound_v2_pka() {
            let (sk, pka) = v2_test_key();
            let keyid = derive_v2_keyid(&pka);
            let uri = spawn_v2_pka_server(sk, keyid, false);
            let record = AidRecord {
                v: SPEC_VERSION_V2.to_string(),
                uri,
                proto: "mcp".to_string(),
                auth: None,
                desc: None,
                docs: None,
                dep: None,
                pka: Some(pka),
                kid: None,
            };

            let result = finish_discovered_record(
                record,
                "_agent.example.com",
                "example.com",
                Duration::from_secs(2),
            )
            .await
            .expect("finish result");

            assert!(!result.domain_bound);
        }
    }
}
