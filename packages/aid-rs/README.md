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

- Parser by default; optional PKA handshake behind a feature flag.
- No runtime dependencies for the parser; handshake uses `reqwest`, `ed25519-dalek`, `bs58`, `httpdate`.

## Install

```toml
[dependencies]
aid-rs = { path = "../aid-rs" }
```

## Usage

### One-liner discovery

```rust,no_run
use aid_rs::discover;

#[tokio::main]
async fn main() -> Result<(), aid_rs::AidError> {
    let record = discover("supabase.agentcommunity.org", std::time::Duration::from_secs(2)).await?;
    println!("Found {} agent at {}", record.proto, record.uri);
    Ok(())
}
```

### Options form

```rust,no_run
use aid_rs::{discover_with_options_result, DiscoveryOptions};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), aid_rs::AidError> {
    let opts = DiscoveryOptions {
        protocol: Some("mcp".to_string()),
        timeout: Duration::from_secs(5),
        well_known_fallback: true,
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

Discovery stays on the exact host you pass in. If you call `discover_with_options("app.team.example.com", ...)`, the client does not implicitly retry `_agent.team.example.com` or `_agent.example.com`.

### Parse TXT records

```rust
use aid_rs::parse;

fn main() -> Result<(), aid_rs::AidError> {
    let rec = parse("v=aid2;uri=https://api.example.com/mcp;p=mcp")?;
    assert_eq!(rec.proto, "mcp");
    Ok(())
}
```

### v2 PKA - optional handshake

Enable the `handshake` feature to verify endpoint control when an `aid2` record includes `pka`/`k`.

```toml
[dependencies]
aid-rs = { path = "../aid-rs", features = ["handshake"] }
```

```rust,no_run
#[cfg(feature = "handshake")]
use aid_rs::perform_pka_handshake;

#[cfg(feature = "handshake")]
#[tokio::main]
async fn main() -> Result<(), aid_rs::AidError> {
    let rec = aid_rs::parse("v=aid2;uri=https://api.example.com/mcp;p=mcp;k=ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ")?;
    // The final argument is the AID-Domain for v2 domain binding; pass `Some("example.com")`
    // to bind the proof to the queried domain, or `None` to skip domain binding.
    let domain_bound = perform_pka_handshake(
        &rec.uri,
        rec.pka.as_deref().unwrap(),
        "",
        std::time::Duration::from_secs(2),
        Some("example.com"),
    ).await?;
    println!("domain_bound={domain_bound}");
    Ok(())
}
```

#### v2 handshake expectations (summary)

- Covered fields set: `"@method";req`, `"@target-uri";req`, `"@authority";req`, and `"@status"`. For a domain-bound proof, the set additionally covers `"aid-domain";req` inserted between `"@authority";req` and `"@status"`.
- `alg="ed25519"`
- `keyid` equals the RFC 7638 thumbprint derived from `k`
- `created` and `expires` define a short validity window
- `nonce` exactly matches the value sent in `Accept-Signature`
- Response includes `Cache-Control: no-store`
- `pka` is unpadded base64url for a 32-byte Ed25519 public key

#### Domain binding

When you pass an `AID-Domain` (the final argument to `perform_pka_handshake`, sent by discovery result APIs for `aid2` records), the client requests a domain-bound proof using the same single `aid-pka-v2` tag; the bound proof additionally covers `"aid-domain";req`. A response that covers `aid-domain` when no `AID-Domain` was sent is rejected (fail-closed).

Use `discover_result`, `discover_with_options_result`, or `fetch_well_known_result` when you need the authenticated `domain_bound` outcome. The legacy `discover`, `discover_with_options`, and `fetch_well_known` helpers still return only `AidRecord` for source compatibility.

### v1 compatibility

Legacy `aid1` records may still use `k=z...` base58btc plus `i`/`kid`. In that mode, clients send `AID-Challenge` and signed HTTP `Date`, and signature `keyid` must match DNS `kid`.

## Redirect Security

Discovered URIs that return a 301/302/307/308 to a different origin (hostname or port) are treated as a potential security risk. Clients should not auto‑follow such redirects.

## More on PKA

See the Identity & PKA reference for exact v2 requirements and legacy v1 compatibility behavior.

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
