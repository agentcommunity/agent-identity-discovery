use std::{fs, path::PathBuf};
use aid_rs::parse;
use serde_json::Value;

fn repo_root() -> PathBuf { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..") }
fn load_fixture() -> String { fs::read_to_string(repo_root().join("test-fixtures").join("golden.json")).expect("read golden.json") }

#[test]
fn parity_from_golden() {
    let data = load_fixture();
    let v: Value = serde_json::from_str(&data).expect("valid json");
    let recs = v.get("records").and_then(|r| r.as_array()).expect("records array");
    assert!(!recs.is_empty(), "no cases parsed from golden.json");
    for rec in recs {
        let raw = rec.get("raw").and_then(|s| s.as_str()).expect("raw string");
        let expected = rec.get("expected").and_then(|o| o.as_object()).expect("expected obj");
        let parsed = parse(raw).expect("parse ok");
        // Compare only keys present in expected
        for (k, v) in expected {
            let val = match k.as_str() {
                "v" => parsed.v.clone(),
                "uri" => parsed.uri.clone(),
                "proto" => parsed.proto.clone(),
                "auth" => parsed.auth.clone().unwrap_or_default(),
                "desc" => parsed.desc.clone().unwrap_or_default(),
                "docs" => parsed.docs.clone().unwrap_or_default(),
                "dep" => parsed.dep.clone().unwrap_or_default(),
                "pka" => parsed.pka.clone().unwrap_or_default(),
                "kid" => parsed.kid.clone().unwrap_or_default(),
                _ => String::new(),
            };
            assert_eq!(val, v.as_str().unwrap_or_default(), "key {} mismatch", k);
        }
    }
}

#[test]
fn invalid_cases_error_codes() {
    let err = parse("uri=https://x;p=mcp").unwrap_err();
    assert_eq!(err.error_code, "ERR_INVALID_TXT");

    let err = parse("v=aid1;uri=https://x;proto=mcp;p=mcp").unwrap_err();
    assert_eq!(err.error_code, "ERR_INVALID_TXT");

    let err = parse("v=aid1;uri=https://x;p=foo").unwrap_err();
    assert_eq!(err.error_code, "ERR_UNSUPPORTED_PROTO");

    let long_desc = "a".repeat(61);
    let err = parse(&format!("v=aid1;uri=https://x;p=mcp;desc={}", long_desc)).unwrap_err();
    assert_eq!(err.error_code, "ERR_INVALID_TXT");

    let rec = parse("version=aid1;u=https://x;proto=mcp").unwrap();
    assert_eq!(rec.v, "aid1");
    assert_eq!(rec.proto, "mcp");

    let err = parse("v=aid1;version=aid1;u=https://x;p=mcp").unwrap_err();
    assert_eq!(err.error_code, "ERR_INVALID_TXT");
}
