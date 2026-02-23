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
use aid_rs::{discover_with_options, DiscoveryOptions};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), aid_rs::AidError> {
    let opts = DiscoveryOptions {
        protocol: Some("mcp".into()), // tries _agent._mcp., then _agent.mcp., then base
        timeout: Duration::from_secs(5),
        well_known_fallback: true,     // only on ERR_NO_RECORD / ERR_DNS_LOOKUP_FAILED
        well_known_timeout: Duration::from_secs(2),
    };
    let rec = discover_with_options("example.com", opts).await?;
    println!("{} {}", rec.proto, rec.uri);
    Ok(())
}
```

## Parse Raw TXT

```rust
use aid_rs::parse;

fn main() -> Result<(), aid_rs::AidError> {
    let rec = parse("v=aid1;uri=https://api.example.com/mcp;p=mcp;desc=Example")?;
    println!("{}", rec.uri);
    Ok(())
}
```

Notes

- TTL from DNS is respected; successful `.well-known` fallback uses TTL=300.
- PKA handshake (when `pka`/`kid` are present) requires enabling the `handshake` feature.

---

**Next:** [Go](quickstart_go.md) | [Protocols & Auth](../Reference/protocols.md) | [Troubleshooting](../Reference/troubleshooting.md)
