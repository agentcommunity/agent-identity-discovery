#![cfg(feature = "handshake")]

use crate::errors::AidError;
use crate::parser::parse;
use crate::record::AidRecord;
use reqwest::redirect::Policy;
use reqwest::Client;
use std::time::Duration;

fn canonicalize_to_txt(obj: &serde_json::Map<String, serde_json::Value>) -> String {
    let get_str = |k: &str| -> Option<String> {
        obj.get(k)
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    };

    // Canonical TXT emission uses short keys for byte budget.
    // Parsing still accepts long keys (`version`, `proto`, etc.) for compatibility.
    let mut parts: Vec<String> = Vec::new();
    if let Some(v) = get_str("v").or_else(|| get_str("version")) { parts.push(format!("v={}", v)); }
    if let Some(u) = get_str("uri").or_else(|| get_str("u")) { parts.push(format!("u={}", u)); }
    if let Some(p) = get_str("proto").or_else(|| get_str("p")) { parts.push(format!("p={}", p)); }
    if let Some(a) = get_str("auth").or_else(|| get_str("a")) { parts.push(format!("a={}", a)); }
    if let Some(s) = get_str("desc").or_else(|| get_str("s")) { parts.push(format!("s={}", s)); }
    if let Some(d) = get_str("docs").or_else(|| get_str("d")) { parts.push(format!("d={}", d)); }
    if let Some(e) = get_str("dep").or_else(|| get_str("e")) { parts.push(format!("e={}", e)); }
    if let Some(k) = get_str("pka").or_else(|| get_str("k")) { parts.push(format!("k={}", k)); }
    if let Some(i) = get_str("kid").or_else(|| get_str("i")) { parts.push(format!("i={}", i)); }
    parts.join(";")
}

/// Fetch https://<domain>/.well-known/agent with strict guards and return a parsed record.
pub async fn fetch_well_known(domain: &str, timeout: Duration) -> Result<AidRecord, AidError> {
    let url = format!("https://{}/.well-known/agent", domain);
    let client = Client::builder().redirect(Policy::none()).timeout(timeout).build()
        .map_err(|e| AidError::new("ERR_FALLBACK_FAILED", e.to_string()))?;
    let res = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| AidError::new("ERR_FALLBACK_FAILED", e.to_string()))?;
    if !res.status().is_success() {
        return Err(AidError::new(
            "ERR_FALLBACK_FAILED",
            format!("Well-known HTTP {}", res.status()),
        ));
    }
    let ct = res
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !ct.starts_with("application/json") {
        return Err(AidError::new(
            "ERR_FALLBACK_FAILED",
            "Invalid content-type for well-known (expected application/json)",
        ));
    }
    let bytes = res
        .bytes()
        .await
        .map_err(|e| AidError::new("ERR_FALLBACK_FAILED", e.to_string()))?;
    if bytes.len() > 64 * 1024 {
        return Err(AidError::new(
            "ERR_FALLBACK_FAILED",
            "Well-known response too large (>64KB)",
        ));
    }
    let json: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| AidError::new("ERR_FALLBACK_FAILED", "Invalid JSON in well-known response"))?;
    let obj = json.as_object().ok_or_else(|| {
        AidError::new(
            "ERR_FALLBACK_FAILED",
            "Well-known JSON must be an object",
        )
    })?;
    let txt = canonicalize_to_txt(obj);
    let rec = parse(&txt)?;
    // Perform PKA handshake when present
    if let (Some(pka), Some(kid)) = (rec.pka.clone(), rec.kid.clone()) {
        // ignore result variable usage; propagate error if any
        crate::pka::perform_pka_handshake(&rec.uri, &pka, &kid, timeout).await?;
    }
    Ok(rec)
}
