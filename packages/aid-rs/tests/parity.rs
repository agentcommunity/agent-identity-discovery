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
    let invalid = v.get("invalid").and_then(|r| r.as_array()).expect("invalid array");
    for rec in invalid {
        let raw = rec.get("raw").and_then(|s| s.as_str()).expect("raw string");
        let expected = rec
            .get("errorCode")
            .and_then(|s| s.as_str())
            .expect("errorCode string");
        let err = parse(raw).expect_err("parse should fail");
        assert_eq!(err.error_code, expected, "invalid case mismatch");
    }
}
