//! PKA handshake verification for Rust (feature = "handshake")
#![cfg(feature = "handshake")]

use crate::errors::AidError;
use base64::engine::general_purpose::STANDARD as B64;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64URL;
use base64::Engine as _;
use ed25519_dalek::{Signature, VerifyingKey, Verifier};
use httpdate::parse_http_date;
use reqwest::header::HeaderMap;
use reqwest::Client;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[derive(Default)]
struct HandshakeControls {
    #[cfg(test)]
    v1_challenge: Option<String>,
    #[cfg(test)]
    v1_date: Option<String>,
    #[cfg(test)]
    v2_nonce: Option<String>,
    #[cfg(test)]
    now_epoch_seconds: Option<i64>,
}

fn controlled_v1_challenge(controls: &HandshakeControls) -> Option<String> {
    #[cfg(test)]
    {
        return controls.v1_challenge.clone();
    }
    #[cfg(not(test))]
    {
        let _ = controls;
        None
    }
}

fn controlled_v1_date(controls: &HandshakeControls) -> Option<String> {
    #[cfg(test)]
    {
        return controls.v1_date.clone();
    }
    #[cfg(not(test))]
    {
        let _ = controls;
        None
    }
}

fn controlled_v2_nonce(controls: &HandshakeControls) -> Option<String> {
    #[cfg(test)]
    {
        return controls.v2_nonce.clone();
    }
    #[cfg(not(test))]
    {
        let _ = controls;
        None
    }
}

fn controlled_now_epoch_seconds(controls: &HandshakeControls) -> Option<i64> {
    #[cfg(test)]
    {
        return controls.now_epoch_seconds;
    }
    #[cfg(not(test))]
    {
        let _ = controls;
        None
    }
}

fn ascii_to_lowercase(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c >= 'A' && c <= 'Z' {
                (c as u8 + ('a' as u8 - 'A' as u8)) as char
            } else {
                c
            }
        })
        .collect()
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).fold(0, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn multibase_decode(input: &str) -> Result<Vec<u8>, AidError> {
    if input.is_empty() {
        return Err(AidError::new("ERR_SECURITY", "Empty PKA"));
    }
    let (prefix, rest) = input.split_at(1);
    match prefix {
        "z" => bs58::decode(rest)
            .into_vec()
            .map_err(|_| AidError::new("ERR_SECURITY", "Invalid base58")),
        _ => Err(AidError::new("ERR_SECURITY", "Unsupported multibase prefix")),
    }
}

fn base64url_decode(input: &str) -> Result<Vec<u8>, AidError> {
    if input.is_empty()
        || input.contains('=')
        || input.len() % 4 == 1
        || !input.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(AidError::new("ERR_SECURITY", "Invalid aid2 PKA encoding"));
    }
    B64URL
        .decode(input)
        .map_err(|_| AidError::new("ERR_SECURITY", "Invalid aid2 PKA encoding"))
}

fn derive_v2_key_material(pka: &str) -> Result<(Vec<u8>, String), AidError> {
    let public_key = base64url_decode(pka)?;
    if public_key.len() != 32 {
        return Err(AidError::new("ERR_SECURITY", "Invalid PKA length"));
    }
    let jwk = format!("{{\"crv\":\"Ed25519\",\"kty\":\"OKP\",\"x\":\"{}\"}}", pka);
    let digest = Sha256::digest(jwk.as_bytes());
    Ok((public_key, B64URL.encode(digest)))
}

fn parse_signature_headers(headers: &HeaderMap) -> Result<(Vec<String>, i64, String, String, Vec<u8>, Option<String>), AidError> {
    let sig_input = headers
        .get("Signature-Input")
        .or_else(|| headers.get("signature-input"))
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AidError::new("ERR_SECURITY", "Missing signature headers"))?;
    let sig = headers
        .get("Signature")
        .or_else(|| headers.get("signature"))
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AidError::new("ERR_SECURITY", "Missing signature headers"))?;

    // Extract covered fields inside parentheses after sig=(...)
    let inside_start = sig_input.find("sig=(").ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature-Input"))? + 5;
    let rest = &sig_input[inside_start..];
    let close = rest.find(')').ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature-Input"))?;
    let inside = &rest[..close];
    let mut covered = Vec::new();
    let mut s = inside;
    while let Some(i) = s.find('"') {
        s = &s[i + 1..];
        if let Some(j) = s.find('"') {
            covered.push(s[..j].to_string());
            s = &s[j + 1..];
        } else {
            break;
        }
    }
    if covered.is_empty() {
        return Err(AidError::new("ERR_SECURITY", "Invalid Signature-Input"));
    }
    let mut required: Vec<&str> = vec!["aid-challenge", "@method", "@target-uri", "host", "date"];
    if covered.len() != required.len() {
        return Err(AidError::new("ERR_SECURITY", "Signature-Input must cover required fields"));
    }
    let mut lower: Vec<String> = covered.iter().map(|c| ascii_to_lowercase(c)).collect();
    lower.sort();
    required.sort();

    let are_equal = lower
        .iter()
        .zip(required.iter())
        .all(|(a, b)| constant_time_eq(a.as_bytes(), b.as_bytes()));

    if !are_equal {
        return Err(AidError::new("ERR_SECURITY", "Signature-Input must cover required fields"));
    }

    // Params
    let mut created: i64 = 0;
    let mut keyid = String::new();
    let mut alg = String::new();
    for part in sig_input.split(';') {
        let p = part.trim();
        let pl = ascii_to_lowercase(p);
        if pl.starts_with("created=") {
            if let Ok(c) = p[8..].parse::<i64>() {
                created = c;
            }
        } else if pl.starts_with("keyid=") {
            keyid = p[6..].trim().to_string();
        } else if pl.starts_with("alg=") {
            alg = ascii_to_lowercase(p[4..].trim().trim_matches('"'));
        }
    }
    if created == 0 || keyid.is_empty() || alg.is_empty() {
        return Err(AidError::new("ERR_SECURITY", "Invalid Signature-Input"));
    }
    // Signature header: sig=:base64:
    let sig_pos = ascii_to_lowercase(sig)
        .find("sig=")
        .ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature header"))?;
    let val = &sig[sig_pos + 4..];
    let val = val.strip_prefix(':').ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature header"))?;
    let end = val.find(':').ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature header"))?;
    let b64 = &val[..end];
    let signature = B64.decode(b64).map_err(|_| AidError::new("ERR_SECURITY", "Invalid Signature header"))?;

    let response_date = headers
        .get("Date")
        .or_else(|| headers.get("date"))
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    Ok((covered, created, keyid, alg, signature, response_date))
}

fn build_signature_base(
    covered: &[String],
    created: i64,
    keyid: &str,
    alg: &str,
    method: &str,
    target_uri: &str,
    host: &str,
    date: &str,
    challenge: &str,
) -> Vec<u8> {
    let mut lines: Vec<String> = Vec::new();
    for item in covered {
        let lower = ascii_to_lowercase(item);
        let mut appended = false;
        if constant_time_eq(lower.as_bytes(), b"aid-challenge") {
            lines.push(format!("\"AID-Challenge\": {}", challenge));
            appended = true;
        }
        if constant_time_eq(lower.as_bytes(), b"@method") {
            lines.push(format!("\"@method\": {}", method));
            appended = true;
        }
        if constant_time_eq(lower.as_bytes(), b"@target-uri") {
            lines.push(format!("\"@target-uri\": {}", target_uri));
            appended = true;
        }
        if constant_time_eq(lower.as_bytes(), b"host") {
            lines.push(format!("\"host\": {}", host));
            appended = true;
        }
        if constant_time_eq(lower.as_bytes(), b"date") {
            lines.push(format!("\"date\": {}", date));
            appended = true;
        }
        if !appended {
            // This should not happen if parse_signature_headers is correct
            return Vec::new();
        }
    }
    let quoted = covered.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(" ");
    let params = format!("({});created={};keyid={};alg=\"{}\"", quoted, created, keyid, alg);
    lines.push(format!("\"@signature-params\": {}", params));
    lines.join("\n").into_bytes()
}

fn generate_v1_challenge() -> Result<String, AidError> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|e| AidError::new("ERR_SECURITY", e.to_string()))?;
    Ok(B64URL.encode(bytes))
}

fn generate_v2_nonce() -> Result<String, AidError> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|e| AidError::new("ERR_SECURITY", e.to_string()))?;
    Ok(B64URL.encode(bytes))
}

fn split_dict_members(input: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut start = 0usize;
    let mut in_string = false;
    let mut escaped = false;
    let mut depth = 0i32;
    for (idx, ch) in input.char_indices() {
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        if ch == '"' {
            in_string = true;
        } else if ch == '(' {
            depth += 1;
        } else if ch == ')' {
            depth -= 1;
        } else if ch == ',' && depth == 0 {
            let part = input[start..idx].trim();
            if !part.is_empty() {
                parts.push(part.to_string());
            }
            start = idx + 1;
        }
    }
    let part = input[start..].trim();
    if !part.is_empty() {
        parts.push(part.to_string());
    }
    parts
}

fn extract_dict_member(input: &str, label: &str) -> Result<String, AidError> {
    let mut found: Option<String> = None;
    for part in split_dict_members(input) {
        if let Some(eq) = part.find('=') {
            let member_label = part[..eq].trim();
            if ascii_to_lowercase(member_label) == label {
                if member_label != label {
                    return Err(AidError::new(
                        "ERR_SECURITY",
                        format!("Invalid {} signature member label", label),
                    ));
                }
                if found.is_some() {
                    return Err(AidError::new(
                        "ERR_SECURITY",
                        format!("Duplicate {} signature member", label),
                    ));
                }
                found = Some(part[eq + 1..].trim().to_string());
            }
        }
    }
    found.ok_or_else(|| AidError::new("ERR_SECURITY", format!("Missing {} signature member", label)))
}

fn combined_header_value(headers: &HeaderMap, name: &'static str) -> Result<String, AidError> {
    let values = headers.get_all(name);
    let mut parts = Vec::new();
    for value in values.iter() {
        parts.push(
            value
                .to_str()
                .map_err(|_| AidError::new("ERR_SECURITY", "Invalid signature headers"))?,
        );
    }
    if parts.is_empty() {
        return Err(AidError::new("ERR_SECURITY", "Missing signature headers"));
    }
    Ok(parts.join(", "))
}

fn unquote_sf(value: &str) -> String {
    if value.len() >= 2 && value.starts_with('"') && value.ends_with('"') {
        value[1..value.len() - 1].replace("\\\"", "\"")
    } else {
        value.to_string()
    }
}

fn param_value_raw(params: &str, name: &str) -> Result<Option<String>, AidError> {
    let mut found: Option<String> = None;
    for part in params.split(';').skip(1) {
        let trimmed = part.trim();
        let (param_name, param_value) = match trimmed.find('=') {
            Some(eq) => (trimmed[..eq].trim(), Some(trimmed[eq + 1..].trim())),
            None => (trimmed, None),
        };
        if param_name == name {
            if found.is_some() {
                return Err(AidError::new(
                    "ERR_SECURITY",
                    format!("Duplicate Signature-Input parameter: {}", name),
                ));
            }
            found = Some(param_value.unwrap_or_default().to_string());
        }
    }
    Ok(found)
}

fn param_value(params: &str, name: &str) -> Result<Option<String>, AidError> {
    Ok(param_value_raw(params, name)?.map(|value| unquote_sf(&value)))
}

fn validate_v2_signature_input_params(params: &str) -> Result<(), AidError> {
    let allowed = ["created", "expires", "keyid", "alg", "nonce", "tag"];
    for part in params.split(';').skip(1) {
        let trimmed = part.trim();
        let param_name = match trimmed.find('=') {
            Some(eq) => trimmed[..eq].trim(),
            None => trimmed,
        };
        if !allowed.iter().any(|allowed_name| *allowed_name == param_name) {
            return Err(AidError::new(
                "ERR_SECURITY",
                format!("Unsupported Signature-Input parameter: {}", param_name),
            ));
        }
    }
    Ok(())
}

fn parse_bare_i64_param(value: &str) -> Result<i64, AidError> {
    let digits = value.strip_prefix('-').unwrap_or(value);
    if digits.is_empty() || !digits.chars().all(|ch| ch.is_ascii_digit()) {
        return Err(AidError::new("ERR_SECURITY", "Invalid Signature-Input timestamp"));
    }
    value
        .parse::<i64>()
        .map_err(|_| AidError::new("ERR_SECURITY", "Invalid Signature-Input timestamp"))
}

#[derive(Debug, Clone)]
struct V2Covered {
    name: String,
    req: bool,
}

#[derive(Debug)]
struct V2ParsedHeaders {
    covered: Vec<V2Covered>,
    signature_params_raw: String,
    created: i64,
    expires: i64,
    keyid: String,
    alg: String,
    nonce: String,
    tag: String,
    signature: Vec<u8>,
}

fn parse_v2_covered_item(raw: &str) -> Result<V2Covered, AidError> {
    if !raw.starts_with('"') {
        return Err(AidError::new("ERR_SECURITY", "Invalid Signature-Input covered item"));
    }
    let quote_end = raw[1..]
        .find('"')
        .ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature-Input covered item"))?
        + 1;
    let name = raw[1..quote_end].to_string();
    let params = &raw[quote_end + 1..];
    let mut req = false;
    if !params.is_empty() && !params.starts_with(';') {
        return Err(AidError::new("ERR_SECURITY", "Invalid Signature-Input covered item parameter"));
    }
    for param in params.split(';').skip(1) {
        if param.is_empty() {
            return Err(AidError::new("ERR_SECURITY", "Invalid Signature-Input covered item parameter"));
        }
        if param == "req" {
            if req {
                return Err(AidError::new(
                    "ERR_SECURITY",
                    "Duplicate Signature-Input covered item parameter: req",
                ));
            }
            req = true;
        } else {
            return Err(AidError::new("ERR_SECURITY", "Unsupported Signature-Input covered item parameter"));
        }
    }
    if !matches!(name.as_str(), "@method" | "@target-uri" | "@authority" | "@status" | "aid-domain") {
        return Err(AidError::new("ERR_SECURITY", format!("Unsupported covered field: {}", name)));
    }
    Ok(V2Covered { name, req })
}

fn validate_v2_covered(covered: &[V2Covered], tag: &str) -> Result<(), AidError> {
    let domain_bound = constant_time_eq(tag.as_bytes(), b"aid-pka-v2-db");
    let expected_len = if domain_bound { 5 } else { 4 };
    if covered.len() != expected_len {
        return Err(AidError::new("ERR_SECURITY", "Signature-Input must cover required fields"));
    }
    let mut seen = HashSet::new();
    for item in covered {
        let expected_req = match item.name.as_str() {
            "@method" | "@target-uri" | "@authority" => true,
            "@status" => false,
            "aid-domain" => {
                if !domain_bound {
                    return Err(AidError::new("ERR_SECURITY", "Signature-Input must cover required fields"));
                }
                true
            }
            _ => return Err(AidError::new("ERR_SECURITY", "Signature-Input must cover required fields")),
        };
        if item.req != expected_req || !seen.insert(item.name.as_str()) {
            return Err(AidError::new("ERR_SECURITY", "Signature-Input must cover required fields"));
        }
    }
    Ok(())
}

fn parse_v2_signature_headers(headers: &HeaderMap) -> Result<V2ParsedHeaders, AidError> {
    let sig_input = combined_header_value(headers, "Signature-Input")?;
    let sig = combined_header_value(headers, "Signature")?;
    let signature_params_raw = extract_dict_member(&sig_input, "aid-pka")?;
    let close = signature_params_raw
        .find(')')
        .ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature-Input"))?;
    if !signature_params_raw.starts_with('(') {
        return Err(AidError::new("ERR_SECURITY", "Invalid Signature-Input"));
    }
    let covered_inner = signature_params_raw[1..close].trim();
    let covered = covered_inner
        .split_whitespace()
        .map(parse_v2_covered_item)
        .collect::<Result<Vec<_>, _>>()?;
    let params = &signature_params_raw[close + 1..];
    validate_v2_signature_input_params(params)?;
    let created_raw = param_value_raw(params, "created")?.ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature-Input"))?;
    let expires_raw = param_value_raw(params, "expires")?.ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature-Input"))?;
    let keyid = param_value(params, "keyid")?.ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature-Input"))?;
    let alg = param_value(params, "alg")?.ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature-Input"))?;
    let nonce = param_value(params, "nonce")?.ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature-Input"))?;
    let tag = param_value(params, "tag")?.ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature-Input"))?;
    validate_v2_covered(&covered, &tag)?;
    let created = parse_bare_i64_param(&created_raw)?;
    let expires = parse_bare_i64_param(&expires_raw)?;
    let sig_raw = extract_dict_member(&sig, "aid-pka")?;
    let sig_b64 = sig_raw
        .trim()
        .strip_prefix(':')
        .and_then(|v| v.strip_suffix(':'))
        .ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid Signature header"))?;
    let signature = B64
        .decode(sig_b64)
        .map_err(|_| AidError::new("ERR_SECURITY", "Invalid Signature header"))?;
    Ok(V2ParsedHeaders { covered, signature_params_raw, created, expires, keyid, alg, nonce, tag, signature })
}

fn has_no_store(headers: &HeaderMap) -> bool {
    headers
        .get("cache-control")
        .and_then(|v| v.to_str().ok())
        .map(|value| {
            value
                .split(',')
                .map(|part| part.trim().split(';').next().unwrap_or("").trim().to_ascii_lowercase())
                .any(|directive| directive == "no-store")
        })
        .unwrap_or(false)
}

fn build_accept_signature_v2(keyid: &str, nonce: &str) -> String {
    format!(
        "aid-pka=(\"@method\";req \"@target-uri\";req \"@authority\";req \"@status\");created;expires;keyid=\"{}\";alg=\"ed25519\";nonce=\"{}\";tag=\"aid-pka-v2\"",
        keyid, nonce
    )
}

fn build_v2_signature_base(parsed: &V2ParsedHeaders, target_uri: &str, authority: &str, status: u16) -> Vec<u8> {
    let mut lines = Vec::new();
    for item in &parsed.covered {
        match item.name.as_str() {
            "@method" => lines.push("\"@method\";req: GET".to_string()),
            "@target-uri" => lines.push(format!("\"@target-uri\";req: {}", target_uri)),
            "@authority" => lines.push(format!("\"@authority\";req: {}", authority)),
            "@status" => lines.push(format!("\"@status\": {}", status)),
            _ => {}
        }
    }
    lines.push(format!("\"@signature-params\": {}", parsed.signature_params_raw));
    lines.join("\n").into_bytes()
}

fn authority_for_url(url: &reqwest::Url) -> Result<String, AidError> {
    let host = url
        .host_str()
        .ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid URI for handshake"))?
        .to_ascii_lowercase();
    let host = if host.contains(':') && !host.starts_with('[') {
        format!("[{}]", host)
    } else {
        host
    };
    Ok(if let Some(port) = url.port() {
        format!("{}:{}", host, port)
    } else {
        host
    })
}

async fn perform_v2_pka_handshake_with_controls(
    uri: &str,
    pka: &str,
    timeout: Duration,
    controls: &HandshakeControls,
) -> Result<(), AidError> {
    let (pubkey, expected_keyid) = derive_v2_key_material(pka)?;
    let mut u = reqwest::Url::parse(uri).map_err(|_| AidError::new("ERR_SECURITY", "Invalid URI for handshake"))?;
    u.set_fragment(None);
    let target_uri = u.to_string();
    let authority = authority_for_url(&u)?;
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(timeout)
        .build()
        .map_err(|e| AidError::new("ERR_SECURITY", e.to_string()))?;
    let nonce = match controlled_v2_nonce(controls) {
        Some(value) => value,
        None => generate_v2_nonce()?,
    };
    let res = client
        .get(u.clone())
        .header("Accept-Signature", build_accept_signature_v2(&expected_keyid, &nonce))
        .header("Cache-Control", "no-store")
        .send()
        .await
        .map_err(|e| AidError::new("ERR_SECURITY", e.to_string()))?;
    if res.status().is_redirection() {
        return Err(AidError::new("ERR_SECURITY", "PKA redirects are not allowed"));
    }
    let status = res.status().as_u16();
    let headers = res.headers().clone();
    if !has_no_store(&headers) {
        return Err(AidError::new("ERR_SECURITY", "PKA response must include Cache-Control: no-store"));
    }
    let parsed = parse_v2_signature_headers(&headers)?;
    let now = controlled_now_epoch_seconds(controls)
        .unwrap_or_else(|| SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64);
    if parsed.expires <= parsed.created || parsed.expires - parsed.created > 300 {
        return Err(AidError::new("ERR_SECURITY", "Invalid signature freshness window"));
    }
    let skew = 30;
    if parsed.created - now > skew || now - parsed.expires > skew {
        return Err(AidError::new("ERR_SECURITY", "Signature timestamp outside acceptance window"));
    }
    if !constant_time_eq(parsed.keyid.as_bytes(), expected_keyid.as_bytes()) {
        return Err(AidError::new("ERR_SECURITY", "Signature keyid mismatch"));
    }
    if !constant_time_eq(ascii_to_lowercase(&parsed.alg).as_bytes(), b"ed25519") {
        return Err(AidError::new("ERR_SECURITY", "Unsupported signature algorithm"));
    }
    if !constant_time_eq(parsed.nonce.as_bytes(), nonce.as_bytes()) {
        return Err(AidError::new("ERR_SECURITY", "Signature nonce mismatch"));
    }
    if !constant_time_eq(parsed.tag.as_bytes(), b"aid-pka-v2") {
        return Err(AidError::new("ERR_SECURITY", "Invalid signature tag"));
    }
    let base = build_v2_signature_base(&parsed, &target_uri, &authority, status);
    let vk = VerifyingKey::from_bytes(pubkey.as_slice().try_into().unwrap())
        .map_err(|_| AidError::new("ERR_SECURITY", "Invalid public key"))?;
    let sig = Signature::from_slice(&parsed.signature).map_err(|_| AidError::new("ERR_SECURITY", "Invalid signature"))?;
    vk.verify(&base, &sig)
        .map_err(|_| AidError::new("ERR_SECURITY", "PKA signature verification failed"))?;
    Ok(())
}

pub async fn perform_pka_handshake(uri: &str, pka: &str, kid: &str, timeout: Duration) -> Result<(), AidError> {
    perform_pka_handshake_with_controls(uri, pka, kid, timeout, &HandshakeControls::default()).await
}

async fn perform_pka_handshake_with_controls(
    uri: &str,
    pka: &str,
    kid: &str,
    timeout: Duration,
    controls: &HandshakeControls,
) -> Result<(), AidError> {
    if kid.is_empty() {
        return perform_v2_pka_handshake_with_controls(uri, pka, timeout, controls).await;
    }
    let u = reqwest::Url::parse(uri).map_err(|_| AidError::new("ERR_SECURITY", "Invalid URI for handshake"))?;
    let host_str = u.host_str().ok_or_else(|| AidError::new("ERR_SECURITY", "Invalid URI for handshake"))?;
    let host = if let Some(port) = u.port() { format!("{}:{}", host_str, port) } else { host_str.to_string() };
    // Disallow redirects for handshake per security policy
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(timeout)
        .build()
        .map_err(|e| AidError::new("ERR_SECURITY", e.to_string()))?;

    let challenge = match controlled_v1_challenge(controls) {
        Some(value) => value,
        None => generate_v1_challenge()?,
    };
    let date = controlled_v1_date(controls).unwrap_or_else(|| httpdate::fmt_http_date(SystemTime::now()));

    let res = client
        .get(u.clone())
        .header("AID-Challenge", &challenge)
        .header("Date", &date)
        .send()
        .await
        .map_err(|e| AidError::new("ERR_SECURITY", e.to_string()))?;
    if !res.status().is_success() {
        return Err(AidError::new("ERR_SECURITY", format!("Handshake HTTP {}", res.status())));
    }
    let headers = res.headers().clone();
    let (covered, created, mut keyid, alg, signature, response_date) = parse_signature_headers(&headers)?;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
    if (now - created).abs() > 300 {
        return Err(AidError::new("ERR_SECURITY", "Signature created timestamp outside acceptance window"));
    }
    if let Some(ref date_hdr) = response_date {
        if let Ok(dt) = parse_http_date(&date_hdr) {
            let epoch = dt.duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
            if (now - epoch).abs() > 300 {
                return Err(AidError::new("ERR_SECURITY", "HTTP Date header outside acceptance window"));
            }
        } else {
            return Err(AidError::new("ERR_SECURITY", "Invalid Date header"));
        }
    }
    // Preserve raw keyid for signature base, compare using normalized (without quotes)
    let keyid_raw_for_base = keyid.clone();
    if keyid.len() >= 2 && keyid.starts_with('"') && keyid.ends_with('"') {
        keyid = keyid.trim_matches('"').to_string();
    }
    if !constant_time_eq(keyid.as_bytes(), kid.as_bytes()) {
        return Err(AidError::new("ERR_SECURITY", "Signature keyid mismatch"));
    }
    if !constant_time_eq(alg.as_bytes(), "ed25519".as_bytes()) {
        return Err(AidError::new("ERR_SECURITY", "Unsupported signature algorithm"));
    }

    let base = build_signature_base(
        &covered,
        created,
        &keyid_raw_for_base,
        &alg,
        "GET",
        uri,
        &host,
        response_date.as_deref().unwrap_or(&date),
        &challenge,
    );

    let pubkey = multibase_decode(pka)?;
    if pubkey.len() != 32 {
        return Err(AidError::new("ERR_SECURITY", "Invalid PKA length"));
    }
    let vk = VerifyingKey::from_bytes(pubkey.as_slice().try_into().unwrap())
        .map_err(|_| AidError::new("ERR_SECURITY", "Invalid public key"))?;
    let sig = Signature::from_slice(&signature).map_err(|_| AidError::new("ERR_SECURITY", "Invalid signature"))?;
    vk.verify(&base, &sig)
        .map_err(|_| AidError::new("ERR_SECURITY", "PKA signature verification failed"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey, VerifyingKey};
    use httpmock::MockServer;
    use serde_json::Value;

    fn v2_vector(vector_id: &str) -> Value {
        let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("..")
            .join("protocol")
            .join("pka_vectors.json");
        let raw = std::fs::read_to_string(path).expect("read pka_vectors.json");
        let parsed: Value = serde_json::from_str(&raw).expect("valid vector json");
        parsed["vectors"]
            .as_array()
            .expect("vectors array")
            .iter()
            .find(|item| item["id"] == vector_id)
            .expect("v2 vector")
            .clone()
    }

    fn canonical_v2_vector() -> Value {
        v2_vector("v2-rfc9421-response-signature")
    }

    fn b58_z(bytes: &[u8]) -> String {
        format!("z{}", bs58::encode(bytes).into_string())
    }

    fn build_v1_base(
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
        let quoted = order.iter().map(|c| format!("\"{}\"", c)).collect::<Vec<_>>().join(" ");
        let params = format!("({});created={};keyid={};alg=\"{}\"", quoted, created, kid, alg);
        lines.push(format!("\"@signature-params\": {}", params));
        (params, lines.join("\n").into_bytes())
    }

    fn v2_parse_headers(signature_input: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert("Signature-Input", signature_input.parse().unwrap());
        headers.insert("Signature", "aid-pka=:AA==:".parse().unwrap());
        headers
    }

    fn v2_signature_input_with_extra(extra: &str) -> String {
        format!(
            "aid-pka=(\"@method\";req \"@target-uri\";req \"@authority\";req \"@status\");created=1;expires=2;keyid=\"k\";alg=\"ed25519\";nonce=\"n\";tag=\"aid-pka-v2\"{}",
            extra
        )
    }

    fn v2_signature_input_with_covered(covered: &str) -> String {
        format!(
            "aid-pka=({});created=1;expires=2;keyid=\"k\";alg=\"ed25519\";nonce=\"n\";tag=\"aid-pka-v2\"",
            covered
        )
    }

    #[test]
    fn rejects_v2_db_missing_aid_domain_coverage() {
        let vector = v2_vector("v2-db-missing-aid-domain-coverage");
        let response = &vector["response"];
        let mut headers = HeaderMap::new();
        headers.insert(
            "Signature-Input",
            response["signature_input"].as_str().expect("signature input").parse().unwrap(),
        );
        headers.insert("Signature", response["signature"].as_str().expect("signature").parse().unwrap());
        headers.insert("Cache-Control", response["cache_control"].as_str().expect("cache control").parse().unwrap());
        let err = parse_v2_signature_headers(&headers).expect_err("db tag without aid-domain coverage must fail");
        assert_eq!(err.error_code, "ERR_SECURITY");
        assert!(err.message.contains("required fields"), "unexpected message: {}", err.message);
    }

    #[test]
    fn verifies_canonical_v2_rfc9421_vector() {
        let vector = canonical_v2_vector();
        let record = &vector["record"];
        let key = &vector["key"];
        let response = &vector["response"];
        let request = &vector["request"];

        let k = record["k"].as_str().expect("record k");
        let (public_key, keyid) = derive_v2_key_material(k).expect("derive v2 key material");
        assert_eq!(keyid, key["jwk_thumbprint"].as_str().expect("thumbprint"));

        let mut headers = HeaderMap::new();
        headers.insert(
            "Signature-Input",
            response["signature_input"].as_str().expect("signature input").parse().unwrap(),
        );
        headers.insert("Signature", response["signature"].as_str().expect("signature").parse().unwrap());
        headers.insert("Cache-Control", response["cache_control"].as_str().expect("cache control").parse().unwrap());
        assert!(has_no_store(&headers));

        let parsed = parse_v2_signature_headers(&headers).expect("parse v2 signature headers");
        assert_eq!(parsed.keyid, keyid);
        assert_eq!(parsed.nonce, vector["nonce"].as_str().expect("nonce"));
        assert_eq!(parsed.tag, "aid-pka-v2");
        assert_eq!(ascii_to_lowercase(&parsed.alg), "ed25519");
        assert!(parsed.expires > parsed.created);
        assert!(parsed.expires - parsed.created <= 300);

        let base = build_v2_signature_base(
            &parsed,
            request["target_uri"].as_str().expect("target uri"),
            request["authority"].as_str().expect("authority"),
            response["status"].as_u64().expect("status") as u16,
        );
        assert_eq!(
            String::from_utf8(base.clone()).expect("signature base utf8"),
            vector["signature_base"].as_str().expect("signature base")
        );

        let vk = VerifyingKey::from_bytes(public_key.as_slice().try_into().unwrap()).expect("valid public key");
        let sig = Signature::from_slice(&parsed.signature).expect("valid signature bytes");
        vk.verify(&base, &sig).expect("canonical v2 signature verifies");
    }

    #[test]
    fn generated_v1_challenges_use_32_random_bytes() {
        let first = generate_v1_challenge().expect("first challenge");
        let second = generate_v1_challenge().expect("second challenge");

        assert_ne!(first, second, "two 32-byte random challenges should not match");
        assert_eq!(B64URL.decode(&first).expect("first base64url").len(), 32);
        assert_eq!(B64URL.decode(&second).expect("second base64url").len(), 32);
        assert!(!first.contains('='));
        assert!(!second.contains('='));
    }

    #[test]
    fn authority_for_url_preserves_ipv6_brackets_and_non_default_ports() {
        let with_port = reqwest::Url::parse("https://[2001:db8::1]:8443/mcp").unwrap();
        assert_eq!(authority_for_url(&with_port).unwrap(), "[2001:db8::1]:8443");

        let default_port = reqwest::Url::parse("https://[2001:db8::1]/mcp").unwrap();
        assert_eq!(authority_for_url(&default_port).unwrap(), "[2001:db8::1]");
    }

    #[test]
    fn canonicalizes_uppercase_host_default_port_query_and_fragment() {
        let vector = v2_vector("v2-uppercase-host-default-port-canonical-target");
        let mut url = reqwest::Url::parse(vector["record"]["u"].as_str().expect("record uri")).unwrap();
        url.set_fragment(None);

        assert_eq!(url.to_string(), vector["request"]["target_uri"].as_str().expect("target uri"));
        assert_eq!(
            authority_for_url(&url).unwrap(),
            vector["request"]["authority"].as_str().expect("authority")
        );
    }

    #[test]
    fn rejects_duplicate_v2_signature_input_parameters() {
        for param in ["nonce", "keyid", "alg", "created", "expires", "tag"] {
            let headers = v2_parse_headers(&v2_signature_input_with_extra(&format!(";{}=\"duplicate\"", param)));
            let err = parse_v2_signature_headers(&headers).expect_err("duplicate parameter must fail");
            assert_eq!(err.error_code, "ERR_SECURITY");
            assert!(err.message.contains(&format!("Duplicate Signature-Input parameter: {}", param)));
        }
    }

    #[test]
    fn rejects_duplicate_aid_pka_dictionary_members() {
        let input = v2_signature_input_with_extra("");
        let headers = v2_parse_headers(&format!("{}, {}", input, input));
        let err = parse_v2_signature_headers(&headers).expect_err("duplicate dictionary member must fail");
        assert_eq!(err.error_code, "ERR_SECURITY");
        assert!(err.message.contains("Duplicate aid-pka signature member"));
    }

    #[test]
    fn rejects_duplicate_aid_pka_signature_input_members_across_repeated_header_values() {
        let input = v2_signature_input_with_extra("");
        let mut headers = HeaderMap::new();
        headers.append("Signature-Input", input.parse().unwrap());
        headers.append("Signature-Input", input.parse().unwrap());
        headers.insert("Signature", "aid-pka=:AA==:".parse().unwrap());

        let err = parse_v2_signature_headers(&headers).expect_err("duplicate repeated dictionary member must fail");
        assert_eq!(err.error_code, "ERR_SECURITY");
        assert!(err.message.contains("Duplicate aid-pka signature member"));
    }

    #[test]
    fn rejects_duplicate_aid_pka_signature_members_across_repeated_header_values() {
        let mut headers = v2_parse_headers(&v2_signature_input_with_extra(""));
        headers.append("Signature", "aid-pka=:AQ==:".parse().unwrap());

        let err = parse_v2_signature_headers(&headers).expect_err("duplicate repeated signature member must fail");
        assert_eq!(err.error_code, "ERR_SECURITY");
        assert!(err.message.contains("Duplicate aid-pka signature member"));
    }

    #[test]
    fn rejects_mixed_case_aid_pka_signature_input_member_label() {
        for label in ["AID-PKA", "Aid-Pka"] {
            let signature_input = v2_signature_input_with_extra("").replacen("aid-pka=", &format!("{}=", label), 1);
            let headers = v2_parse_headers(&signature_input);
            let err = parse_v2_signature_headers(&headers).expect_err("mixed-case Signature-Input member label must fail");
            assert_eq!(err.error_code, "ERR_SECURITY");
            assert!(err.message.contains("Invalid aid-pka signature member label"));
        }
    }

    #[test]
    fn rejects_exact_plus_mixed_case_aid_pka_signature_input_member_label() {
        let exact = v2_signature_input_with_extra("");
        for label in ["AID-PKA", "Aid-Pka"] {
            let headers = v2_parse_headers(&format!("{}, {}=()", exact, label));
            let err =
                parse_v2_signature_headers(&headers).expect_err("case-confused Signature-Input member must fail");
            assert_eq!(err.error_code, "ERR_SECURITY");
            assert!(err.message.contains("aid-pka signature member"));
        }
    }

    #[test]
    fn rejects_mixed_case_aid_pka_signature_member_label() {
        for label in ["AID-PKA", "Aid-Pka"] {
            let mut headers = HeaderMap::new();
            headers.insert("Signature-Input", v2_signature_input_with_extra("").parse().unwrap());
            headers.insert("Signature", format!("{}=:AA==:", label).parse().unwrap());

            let err = parse_v2_signature_headers(&headers).expect_err("mixed-case Signature member label must fail");
            assert_eq!(err.error_code, "ERR_SECURITY");
            assert!(err.message.contains("Invalid aid-pka signature member label"));
        }
    }

    #[test]
    fn rejects_exact_plus_mixed_case_aid_pka_signature_member_label() {
        for label in ["AID-PKA", "Aid-Pka"] {
            let mut headers = HeaderMap::new();
            headers.insert("Signature-Input", v2_signature_input_with_extra("").parse().unwrap());
            headers.insert("Signature", format!("aid-pka=:AA==:, {}=:AQ==:", label).parse().unwrap());

            let err = parse_v2_signature_headers(&headers).expect_err("case-confused Signature member must fail");
            assert_eq!(err.error_code, "ERR_SECURITY");
            assert!(err.message.contains("aid-pka signature member"));
        }
    }

    #[test]
    fn rejects_unknown_v2_signature_input_top_level_parameter() {
        let headers = v2_parse_headers(&v2_signature_input_with_extra(";foo=\"bar\""));
        let err = parse_v2_signature_headers(&headers).expect_err("unknown top-level parameter must fail");
        assert_eq!(err.error_code, "ERR_SECURITY");
        assert!(err.message.contains("Unsupported Signature-Input parameter"));
    }

    #[test]
    fn rejects_mixed_case_v2_signature_input_top_level_parameters() {
        for (param, replacement) in [("created=", "Created="), ("keyid=", "KeyID=")] {
            let signature_input = v2_signature_input_with_extra("").replacen(param, replacement, 1);
            let headers = v2_parse_headers(&signature_input);
            let err = parse_v2_signature_headers(&headers).expect_err("mixed-case top-level parameter must fail");
            assert_eq!(err.error_code, "ERR_SECURITY");
            assert!(err.message.contains("Unsupported Signature-Input parameter"));
        }
    }

    #[test]
    fn rejects_quoted_v2_created_and_expires_parameters() {
        for timestamp_param in ["created", "expires"] {
            let signature_input = v2_signature_input_with_extra("")
                .replacen(&format!("{}=", timestamp_param), &format!("{}=\"", timestamp_param), 1)
                .replacen(
                    if timestamp_param == "created" { ";expires=" } else { ";keyid=" },
                    if timestamp_param == "created" { "\";expires=" } else { "\";keyid=" },
                    1,
                );
            let headers = v2_parse_headers(&signature_input);
            let err = parse_v2_signature_headers(&headers).expect_err("quoted timestamp parameter must fail");
            assert_eq!(err.error_code, "ERR_SECURITY");
            assert!(err.message.contains("Invalid Signature-Input timestamp"));
        }
    }

    #[test]
    fn rejects_duplicate_v2_covered_req_parameter() {
        let headers = v2_parse_headers(&v2_signature_input_with_covered(
            "\"@method\";req;req \"@target-uri\";req \"@authority\";req \"@status\"",
        ));
        let err = parse_v2_signature_headers(&headers).expect_err("duplicate covered ;req must fail");
        assert_eq!(err.error_code, "ERR_SECURITY");
        assert!(err.message.contains("Duplicate Signature-Input covered item parameter"));
    }

    #[test]
    fn rejects_uppercase_v2_covered_req_parameter() {
        for req_param in ["REQ", "Req"] {
            let headers = v2_parse_headers(&v2_signature_input_with_covered(&format!(
                "\"@method\";{} \"@target-uri\";req \"@authority\";req \"@status\"",
                req_param
            )));
            let err = parse_v2_signature_headers(&headers).expect_err("uppercase covered ;req must fail");
            assert_eq!(err.error_code, "ERR_SECURITY");
            assert!(err.message.contains("Unsupported Signature-Input covered item parameter"));
        }
    }

    #[test]
    fn rejects_unknown_v2_covered_item_parameter() {
        let headers = v2_parse_headers(&v2_signature_input_with_covered(
            "\"@method\";req;foo \"@target-uri\";req \"@authority\";req \"@status\"",
        ));
        let err = parse_v2_signature_headers(&headers).expect_err("unknown covered parameter must fail");
        assert_eq!(err.error_code, "ERR_SECURITY");
        assert!(err.message.contains("Unsupported Signature-Input covered item parameter"));
    }

    #[test]
    fn rejects_duplicate_v2_covered_field_names() {
        let headers = v2_parse_headers(&v2_signature_input_with_covered(
            "\"@method\";req \"@method\";req \"@authority\";req \"@status\"",
        ));
        let err = parse_v2_signature_headers(&headers).expect_err("duplicate covered field must fail");
        assert_eq!(err.error_code, "ERR_SECURITY");
        assert!(err.message.contains("Signature-Input must cover required fields"));
    }

    #[test]
    fn rejects_missing_v2_required_covered_items() {
        let headers = v2_parse_headers(&v2_signature_input_with_covered(
            "\"@method\";req \"@target-uri\";req \"@status\"",
        ));
        let err = parse_v2_signature_headers(&headers).expect_err("missing required covered field must fail");
        assert_eq!(err.error_code, "ERR_SECURITY");
        assert!(err.message.contains("Signature-Input must cover required fields"));
    }

    #[test]
    fn rejects_v2_date_or_extra_covered_fields() {
        for covered_name in ["date", "x-extra"] {
            let headers = v2_parse_headers(&v2_signature_input_with_covered(&format!(
                "\"@method\";req \"@target-uri\";req \"@authority\";req \"{}\"",
                covered_name
            )));
            let err = parse_v2_signature_headers(&headers).expect_err("unsupported covered field must fail");
            assert_eq!(err.error_code, "ERR_SECURITY");
            assert!(err.message.contains("Unsupported covered field"));
        }
    }

    #[test]
    fn rejects_mixed_case_v2_derived_covered_fields() {
        for covered_name in ["@Method", "@METHOD"] {
            let headers = v2_parse_headers(&v2_signature_input_with_covered(&format!(
                "\"{}\";req \"@target-uri\";req \"@authority\";req \"@status\"",
                covered_name
            )));
            let err = parse_v2_signature_headers(&headers).expect_err("mixed-case derived covered field must fail");
            assert_eq!(err.error_code, "ERR_SECURITY");
            assert!(err.message.contains("Unsupported covered field"));
        }
    }

    #[tokio::test]
    async fn controlled_v1_handshake_uses_injected_challenge_and_date() {
        let server = MockServer::start();
        let seed = [0u8; 32];
        let sk = SigningKey::from_bytes(&seed);
        let vk = VerifyingKey::from(&sk);
        let pka = b58_z(vk.as_bytes());
        let kid = "g1";
        let created = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64;
        let challenge = "TESTCHAL";
        let date = httpdate::fmt_http_date(SystemTime::now());
        let order = ["AID-Challenge", "@method", "@target-uri", "host", "date"];
        let (params, base) = build_v1_base(
            &order,
            challenge,
            "GET",
            &server.url("/mcp"),
            &server.address().to_string(),
            &date,
            created,
            kid,
            "ed25519",
        );
        let signature = sk.sign(&base);
        let signature_header = format!("sig=:{}:", B64.encode(signature.to_bytes()));
        let date_for_header = date.clone();
        let handshake = server.mock(move |when, then| {
            when.method("GET")
                .path("/mcp")
                .header("AID-Challenge", challenge)
                .header("Date", date_for_header.as_str());
            then.status(200)
                .header("date", date_for_header.as_str())
                .header("Signature-Input", format!("sig={}", params))
                .header("Signature", signature_header.clone());
        });

        perform_pka_handshake_with_controls(
            &server.url("/mcp"),
            &pka,
            kid,
            Duration::from_secs(2),
            &HandshakeControls {
                v1_challenge: Some(challenge.to_string()),
                v1_date: Some(date),
                ..HandshakeControls::default()
            },
        )
        .await
        .expect("controlled v1 handshake should verify");
        handshake.assert_hits(1);
    }
}
