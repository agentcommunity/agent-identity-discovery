# aid-rs

## Rust

# Agent Identity & Discovery

> DNS for agents

AID as the public address book for the agentic web.

It's a simple, open standard that uses the internet's own directory—DNS—to answer one question: **"Given a domain, where is its AI agent, and how do I know it's the real one?"**

No more hunting through API docs. No more manual configuration. It's the zero-friction layer for a world of interconnected agents.

Built by the team at [agentcommunity.org](https://agentcommunity.org).

- **Website**: [aid.agentcommunity.org](https://aid.agentcommunity.org)
- **Docs**: [docs.agentcommunity.org/aid](https://docs.agentcommunity.org/aid)
- **GitHub**: [github.com/agentcommunity/agent-identity-discovery](https://github.com/agentcommunity/agent-identity-discovery)

---

Rust crate for Agent Identity & Discovery (AID) parsing and generated constants.

- Parser and discovery with PKA handshake enabled by default.
- For parser-only builds, disable default features.

## Install

```toml
[dependencies]
aid-rs = { path = "../aid-rs" }
```

## Usage

### One-liner discovery

```rust
use aid_rs::discover;

#[tokio::main]
async fn main() -> Result<(), aid_rs::AidError> {
    let record = discover("supabase.agentcommunity.org", std::time::Duration::from_secs(2)).await?;
    println!("Found {} agent at {}", record.proto, record.uri);
    Ok(())
}
```

### Options form

```rust
use aid_rs::{discover_with_options, DiscoveryOptions};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), aid_rs::AidError> {
    let opts = DiscoveryOptions {
        protocol: Some("mcp".to_string()),
        timeout: Duration::from_secs(5),
        well_known_fallback: true,
        well_known_timeout: Duration::from_secs(2),
    };
    let rec = discover_with_options("example.com", opts).await?;
    println!("{} {}", rec.proto, rec.uri);
    Ok(())
}
```

### Parse TXT records

```rust
use aid_rs::parse;

fn main() -> Result<(), aid_rs::AidError> {
    let rec = parse("v=aid1;uri=https://api.example.com/mcp;p=mcp")?;
    assert_eq!(rec.proto, "mcp");
    Ok(())
}
```

### v1.2 (PKA) – enabled by default

`handshake` is in default features to ensure spec-aligned verification when a record includes `pka`/`kid`.

```toml
[dependencies]
aid-rs = { path = "../aid-rs" }
```

For parser-only/minimal builds:

```toml
[dependencies]
aid-rs = { path = "../aid-rs", default-features = false }
```

```rust
#[cfg(feature = "handshake")]
use aid_rs::perform_pka_handshake;

#[cfg(feature = "handshake")]
#[tokio::main]
async fn main() -> Result<(), aid_rs::AidError> {
    let rec = aid_rs::parse("v=aid1;uri=https://api.example.com/mcp;p=mcp;k=zBase58;i=g1")?;
    perform_pka_handshake(&rec.uri, rec.pka.as_deref().unwrap(), rec.kid.as_deref().unwrap(), std::time::Duration::from_secs(2)).await?;
    Ok(())
}
```

#### Handshake expectations (summary)

- Covered fields (exact set): `"AID-Challenge" "@method" "@target-uri" "host" "date"`
- `alg="ed25519"`
- `keyid` equals record `kid` (compare normalized; keep raw in signature base)
- `created` ± 300s and HTTP `Date` ± 300s of now
- `pka` is `z...` (base58btc) for a 32‑byte Ed25519 public key

## Redirect Security

Discovered URIs that return a 301/302/307/308 to a different origin (hostname or port) are treated as a potential security risk. Clients should not auto‑follow such redirects.

## More on PKA

See the documentation “Quick Start → PKA handshake expectations” for the exact requirements.

## Errors

See `packages/docs/specification.md` for standard error codes (1000–1005).

## Development

```bash
pnpm gen
cd packages/aid-rs
cargo build
cargo test
# With handshake feature
cargo test --features handshake
```
