---
title: 'Rust'
description: 'Discover agents using the Rust crate'
icon: material/language-rust
---

# Rust

## Install

Add the crate to your `Cargo.toml` (path example for a workspace checkout):

```toml
[dependencies]
aid-rs = { path = "../aid-rs" }
```

Enable the `handshake` feature if you want PKA verification:

```toml
[dependencies]
aid-rs = { path = "../aid-rs", features = ["handshake"] }
```

## Discover by Domain

```rust
use aid_rs::discover;
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), aid_rs::AidError> {
    let rec = discover("supabase.agentcommunity.org", Duration::from_secs(5)).await?;
    println!("{} {}", rec.proto, rec.uri);
    Ok(())
}
```

## Options

Protocol-specific DNS flow and guarded `.well-known` fallback:

```rust
use aid_rs::{discover_with_options_result, DiscoveryOptions};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), aid_rs::AidError> {
    let opts = DiscoveryOptions {
        protocol: Some("mcp".into()), // validates mcp after base lookup; proto probe is diagnostic
        timeout: Duration::from_secs(5),
        well_known_fallback: true,     // only on ERR_NO_RECORD / ERR_DNS_LOOKUP_FAILED
        well_known_timeout: Duration::from_secs(2),
    };
    let result = discover_with_options_result("example.com", opts).await?;
    println!(
        "{} {} domain_bound={}",
        result.record.proto, result.record.uri, result.domain_bound
    );
    Ok(())
}
```

## Parse Raw TXT

```rust
use aid_rs::parse;

fn main() -> Result<(), aid_rs::AidError> {
    let rec = parse("v=aid2;u=https://api.example.com/mcp;p=mcp;s=Example")?;
    println!("{}", rec.uri);
    Ok(())
}
```

Notes

- TTL from DNS is respected; successful `.well-known` fallback uses TTL=300.
- PKA handshake (when v2 `pka`/`k` is present) requires enabling the `handshake` feature. Legacy `aid1` records still use `pka`/`kid`.
- For `aid2` PKA, the SDK sends the queried host in the `AID-Domain` header by default and surfaces `DiscoveryResult.domain_bound` (`true` only for a verified domain-bound proof — one whose `aid-pka-v2` covered set includes `"aid-domain";req`). The legacy record-only helpers still return `AidRecord` for compatibility. Requesting binding is not itself a mitigation — only `domain-binding=require` enforces it. See [Specification Appendix B.7](../specification.md#b7-domain-binding).

---

**Next:** [Go](quickstart_go.md) | [Protocols & Auth](../Reference/protocols.md) | [Troubleshooting](../Reference/troubleshooting.md)
