#![cfg(feature = "handshake")]

use aid_rs::perform_pka_handshake;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
use httpmock::MockServer;
use std::time::Duration;

fn b58_z(bytes: &[u8]) -> String {
    format!("z{}", bs58::encode(bytes).into_string())
}

fn build_base(
    order: &[&str],
    challenge: &str,
    method: &str,
    target: &str,
    host: &str,
    date: &str,
    created: i64,
    kid: &str,
    alg: &str,
) -> (String, Vec<u8>) {
    let mut lines = Vec::new();
    for item in order {
        match *item {
            "AID-Challenge" => lines.push(format!("\"AID-Challenge\": {}", challenge)),
            "@method" => lines.push(format!("\"@method\": {}", method)),
            "@target-uri" => lines.push(format!("\"@target-uri\": {}", target)),
            "host" => lines.push(format!("\"host\": {}", host)),
            "date" => lines.push(format!("\"date\": {}", date)),
            _ => {}
        }
    }
    let quoted = order
        .iter()
        .map(|c| format!("\"{}\"", c))
        .collect::<Vec<_>>()
        .join(" ");
    let params = format!(
        "({});created={};keyid={};alg=\"{}\"",
        quoted, created, kid, alg
    );
    lines.push(format!("\"@signature-params\": {}", params));
    (params, lines.join("\n").into_bytes())
}

#[tokio::test]
async fn rust_pka_kid_mismatch_fails() {
    let server = MockServer::start();
    let seed = [0u8; 32];
    let sk = SigningKey::from_bytes(&seed);
    let vk = VerifyingKey::from(&sk);
    let pka = b58_z(vk.as_bytes());
    let kid = "g1";
    let created: i64 = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()) as i64;
    let order = ["AID-Challenge", "@method", "@target-uri", "host", "date"]; // exact set

    let date_hdr = httpdate::fmt_http_date(std::time::SystemTime::now());
    let kid2 = "b2";
    let (.., base_bad) = build_base(
        &order,
        "TESTCHAL",
        "GET",
        &server.url("/bad"),
        &server.address().to_string(),
        &date_hdr,
        created,
        kid2,
        "ed25519",
    );
    let sig_bad = sk.sign(&base_bad);
    let sig_bad_b64 = B64.encode(sig_bad.to_bytes());
    let sig_input_bad = format!(
        "sig=(\"{}\");created={};keyid={};alg=\"ed25519\"",
        order.join("\" \""),
        created,
        kid2
    );
    let sig_header_bad = format!("sig=:{}:", sig_bad_b64);
    let _handshake_bad = server.mock(|when, then| {
        when.method("GET").path("/bad");
        then.status(200)
            .header("date", date_hdr)
            .header("Signature-Input", sig_input_bad.clone())
            .header("Signature", sig_header_bad.clone());
    });

    let url = server.url("/bad");
    let res = perform_pka_handshake(&url, &pka, kid, Duration::from_secs(2), None).await;
    assert!(res.is_err());
}

#[tokio::test]
async fn rust_pka_missing_fields_fails() {
    let server = MockServer::start();
    let seed = [0u8; 32];
    let sk = SigningKey::from_bytes(&seed);
    let vk = VerifyingKey::from(&sk);
    let pka = b58_z(vk.as_bytes());
    let kid = "g1";
    let created: i64 = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()) as i64;
    let order = ["AID-Challenge", "@method"]; // missing required fields

    let _wk = server.mock(|when, then| {
        when.method("GET").path("/.well-known/agent");
        then.status(200)
            .header("content-type", "application/json")
            .body(format!(
                "{{\"v\":\"aid1\",\"u\":\"{}\",\"p\":\"mcp\",\"k\":\"{}\",\"i\":\"{}\"}}",
                server.url("/bad2"),
                pka,
                kid
            ));
    });
    // Use same deterministic challenge/date; build a base missing required fields
    let mut lines: Vec<String> = Vec::new();
    for item in &order {
        match *item {
            "AID-Challenge" => lines.push(format!("\"AID-Challenge\": {}", "TESTCHAL")),
            "@method" => lines.push("\"@method\": GET".to_string()),
            _ => {}
        }
    }
    let quoted = order
        .iter()
        .map(|c| format!("\"{}\"", c))
        .collect::<Vec<_>>()
        .join(" ");
    let params = format!(
        "({});created={};keyid={};alg=\"ed25519\"",
        quoted, created, kid
    );
    lines.push(format!("\"@signature-params\": {}", params));
    let base_missing = lines.join("\n").into_bytes();
    let sig_missing = sk.sign(&base_missing);
    let sig_missing_b64 = base64::engine::general_purpose::STANDARD.encode(sig_missing.to_bytes());
    let _hs = server.mock(|when, then| {
        when.method("GET").path("/bad2");
        then.status(200)
            .header("date", "Thu, 01 Jan 2026 00:00:00 GMT")
            .header("Signature-Input", params.clone())
            .header("Signature", format!("sig=:{}:", sig_missing_b64));
    });
    let res = perform_pka_handshake(
        &server.url("/bad2"),
        &pka,
        kid,
        std::time::Duration::from_secs(2),
        None,
    )
    .await;
    assert!(res.is_err());
}

#[tokio::test]
async fn rust_pka_date_skew_fails() {
    let server = MockServer::start();
    let seed = [0u8; 32];
    let sk = SigningKey::from_bytes(&seed);
    let vk = VerifyingKey::from(&sk);
    let pka = b58_z(vk.as_bytes());
    let kid = "g1";
    let created: i64 = (std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64)
        - 1000;
    let order = ["AID-Challenge", "@method", "@target-uri", "host", "date"]; // full set

    let _wk = server.mock(|when, then| {
        when.method("GET").path("/.well-known/agent");
        then.status(200)
            .header("content-type", "application/json")
            .body(format!(
                "{{\"v\":\"aid1\",\"u\":\"{}\",\"p\":\"mcp\",\"k\":\"{}\",\"i\":\"{}\"}}",
                server.url("/bad3"),
                pka,
                kid
            ));
    });
    let past_date = "Thu, 01 Jan 2020 00:00:00 GMT";
    let (.., base_skew) = build_base(
        &order,
        "TESTCHAL",
        "GET",
        &server.url("/bad3"),
        &server.address().to_string(),
        past_date,
        created,
        kid,
        "ed25519",
    );
    let sig_skew = sk.sign(&base_skew);
    let sig_skew_b64 = base64::engine::general_purpose::STANDARD.encode(sig_skew.to_bytes());
    let sig_input_skew = format!(
        "sig=(\"{}\");created={};keyid={};alg=\"ed25519\"",
        order.join("\" \""),
        created,
        kid
    );
    let _hs = server.mock(|when, then| {
        when.method("GET").path("/bad3");
        then.status(200)
            .header("date", past_date)
            .header("Signature-Input", sig_input_skew.clone())
            .header("Signature", format!("sig=:{}:", sig_skew_b64));
    });
    let res = perform_pka_handshake(
        &server.url("/bad3"),
        &pka,
        kid,
        std::time::Duration::from_secs(2),
        None,
    )
    .await;
    assert!(res.is_err());
}
