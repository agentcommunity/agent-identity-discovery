use std::collections::HashSet;

use crate::constants_gen::{
    AUTH_APIKEY, AUTH_BASIC, AUTH_CUSTOM, AUTH_MTLS, AUTH_NONE, AUTH_OAUTH2_CODE, AUTH_OAUTH2_DEVICE,
    AUTH_PAT, PROTO_A2A, PROTO_GRAPHQL, PROTO_GRPC, PROTO_LOCAL, PROTO_MCP, PROTO_OPENAPI,
    PROTO_UCP, PROTO_WEBSOCKET, PROTO_ZEROCONF, SPEC_VERSION, LOCAL_URI_SCHEMES,
};
use crate::errors::AidError;
use crate::record::AidRecord;

fn is_supported_proto(token: &str) -> bool {
    matches!(
        token,
        PROTO_MCP | PROTO_A2A | PROTO_OPENAPI | PROTO_LOCAL | PROTO_GRPC | PROTO_GRAPHQL | PROTO_UCP | PROTO_WEBSOCKET | PROTO_ZEROCONF
    )
}

fn is_supported_auth(token: &str) -> bool {
    matches!(
        token,
        AUTH_NONE | AUTH_PAT | AUTH_APIKEY | AUTH_BASIC | AUTH_OAUTH2_DEVICE | AUTH_OAUTH2_CODE | AUTH_MTLS | AUTH_CUSTOM
    )
}

pub fn parse(txt: &str) -> Result<AidRecord, AidError> {
    let mut v: Option<String> = None;
    let mut version: Option<String> = None;
    let mut uri: Option<String> = None;
    let mut proto: Option<String> = None;
    let mut p: Option<String> = None;
    let mut auth: Option<String> = None;
    let mut desc: Option<String> = None;
    let mut docs: Option<String> = None;
    let mut dep: Option<String> = None;
    let mut pka: Option<String> = None;
    let mut kid: Option<String> = None;

    let mut seen: HashSet<String> = HashSet::new();

    for raw_pair in txt.split(';') {
        let pair = raw_pair.trim();
        if pair.is_empty() { continue; }
        let mut iter = pair.splitn(2, '=');
        let key_raw = iter.next().ok_or_else(|| AidError::invalid_txt("Invalid key-value pair"))?;
        let value_raw = iter.next().ok_or_else(|| AidError::invalid_txt(format!("Invalid key-value pair: {}", pair)))?;
        let key = key_raw.trim().to_lowercase();
        let value = value_raw.trim().to_string();
        if key.is_empty() || value.is_empty() {
            return Err(AidError::invalid_txt(format!("Empty key or value in pair: {}", pair)));
        }
        match key.as_str() {
            "v" | "version" | "uri" | "u" | "proto" | "p" | "auth" | "a" | "desc" | "s" | "docs" | "d" | "dep" | "e" | "pka" | "k" | "kid" | "i" => {
                if seen.contains(&key) { return Err(AidError::invalid_txt(format!("Duplicate key: {}", key))); }
                seen.insert(key.clone());
            }
            _ => {}
        }
        match key.as_str() {
            "v" => v = Some(value),
            "version" => version = Some(value),
            "uri" | "u" => {
                if uri.is_none() { uri = Some(value) } else { return Err(AidError::invalid_txt("Cannot specify both \"uri\" and \"u\"")); }
            }
            "proto" => proto = Some(value),
            "p" => p = Some(value),
            "auth" | "a" => {
                if auth.is_none() { auth = Some(value) } else { return Err(AidError::invalid_txt("Cannot specify both \"auth\" and \"a\"")); }
            }
            "desc" | "s" => {
                if desc.is_none() { desc = Some(value) } else { return Err(AidError::invalid_txt("Cannot specify both \"desc\" and \"s\"")); }
            }
            "docs" | "d" => {
                if docs.is_none() { docs = Some(value) } else { return Err(AidError::invalid_txt("Cannot specify both \"docs\" and \"d\"")); }
            }
            "dep" | "e" => {
                if dep.is_none() { dep = Some(value) } else { return Err(AidError::invalid_txt("Cannot specify both \"dep\" and \"e\"")); }
            }
            "pka" | "k" => {
                if pka.is_none() { pka = Some(value) } else { return Err(AidError::invalid_txt("Cannot specify both \"pka\" and \"k\"")); }
            }
            "kid" | "i" => {
                if kid.is_none() { kid = Some(value) } else { return Err(AidError::invalid_txt("Cannot specify both \"kid\" and \"i\"")); }
            }
            _ => {}
        }
    }

    // Canonical wire key is `v`, but we accept `version` for compatibility.
    if v.is_some() && version.is_some() {
        return Err(AidError::invalid_txt("Cannot specify both \"version\" and \"v\" fields"));
    }
    let v = v.or(version).ok_or_else(|| AidError::invalid_txt("Missing required field: v"))?;
    if v != SPEC_VERSION {
        return Err(AidError::invalid_txt(format!("Unsupported version: {}. Expected: {}", v, SPEC_VERSION)));
    }

    let uri = uri.ok_or_else(|| AidError::invalid_txt("Missing required field: uri"))?;

    if proto.is_some() && p.is_some() { return Err(AidError::invalid_txt("Cannot specify both \"proto\" and \"p\" fields")); }
    if proto.is_none() && p.is_none() { return Err(AidError::invalid_txt("Missing required field: proto (or p)")); }

    let proto_value = proto.or(p).unwrap();

    if !is_supported_proto(&proto_value) { return Err(AidError::unsupported_proto(format!("Unsupported protocol: {}", proto_value))); }

    if let Some(ref auth_val) = auth {
        if !is_supported_auth(auth_val.as_str()) {
            return Err(AidError::invalid_txt(format!("Invalid auth token: {}", auth_val)));
        }
    }

    if let Some(ref d) = desc {
        if d.as_bytes().len() > 60 {
            return Err(AidError::invalid_txt("Description field must be ≤ 60 UTF-8 bytes"));
        }
    }

    // docs must be https URL when present
    if let Some(ref dv) = docs {
        if !dv.starts_with("https://") {
            return Err(AidError::invalid_txt("docs MUST be an absolute https:// URL"));
        }
        // Minimal absolute-URL check: ensure non-empty host after scheme
        let rest = &dv[8..];
        let host_end = rest.find(&['/', '?', '#'][..]).unwrap_or(rest.len());
        let host = &rest[..host_end];
        if host.is_empty() {
            return Err(AidError::invalid_txt(format!("Invalid docs URL: {}", dv)));
        }
    }

    // dep must end with Z (basic check)
    if let Some(ref dp) = dep {
        // Strict RFC3339-like check: YYYY-MM-DDTHH:MM:SSZ
        let s = dp.as_str();
        let ok = s.len() == 20
            && s.as_bytes()[4] == b'-'
            && s.as_bytes()[7] == b'-'
            && s.as_bytes()[10] == b'T'
            && s.as_bytes()[13] == b':'
            && s.as_bytes()[16] == b':'
            && s.as_bytes()[19] == b'Z'
            && s[..4].chars().all(|c| c.is_ascii_digit())
            && s[5..7].chars().all(|c| c.is_ascii_digit())
            && s[8..10].chars().all(|c| c.is_ascii_digit())
            && s[11..13].chars().all(|c| c.is_ascii_digit())
            && s[14..16].chars().all(|c| c.is_ascii_digit())
            && s[17..19].chars().all(|c| c.is_ascii_digit());
        if !ok {
            return Err(AidError::invalid_txt(
                "dep MUST be an ISO 8601 UTC timestamp (e.g., 2026-01-01T00:00:00Z)",
            ));
        }
    }

    // URI validation based on protocol
    if proto_value == PROTO_LOCAL {
        // Enforce local scheme allowlist per spec
        // Extract scheme before ':'
        let scheme = uri.split(':').next().unwrap_or("");
        let allowed = LOCAL_URI_SCHEMES.iter().any(|s| *s == scheme);
        if !allowed {
            let list = LOCAL_URI_SCHEMES.join(", ");
            return Err(AidError::invalid_txt(format!(
                "Invalid URI scheme for local protocol. Must be one of: {}",
                list
            )));
        }
    } else if proto_value == PROTO_ZEROCONF {
        if !uri.starts_with("zeroconf:") { return Err(AidError::invalid_txt("Invalid URI scheme for 'zeroconf'. MUST be 'zeroconf:'")); }
    } else if proto_value == PROTO_WEBSOCKET {
        if !uri.starts_with("wss://") { return Err(AidError::invalid_txt("Invalid URI scheme for 'websocket'. MUST be 'wss:'")); }
    } else {
        if !uri.starts_with("https://") { return Err(AidError::invalid_txt(format!("Invalid URI scheme for remote protocol '{}'. MUST be 'https:'", proto_value))); }
    }

    // If PKA is present, kid is required
    if pka.is_some() && kid.is_none() {
        return Err(AidError::invalid_txt("kid is required when pka is present"));
    }

    Ok(AidRecord { v, uri, proto: proto_value, auth, desc, docs, dep, pka, kid })
}
