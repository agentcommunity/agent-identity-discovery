---
'@agentcommunity/aid': patch
---

All official SDKs (Go, Python, Rust, .NET, Java) now reach parity with the TypeScript SDK's PKA domain-binding profile: they send `AID-Domain` by default for v2 PKA, verify the `"aid-domain";req` covered component on an `aid-pka-v2` signature, and surface a `domainBound` result (Rust verifies and rejects identically; surfacing `domainBound` through Rust discovery is a fast-follow). Unbound `aid-pka-v2` proofs without `aid-domain` coverage remain valid.
