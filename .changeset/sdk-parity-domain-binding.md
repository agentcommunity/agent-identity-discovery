---
'@agentcommunity/aid': patch
---

All official SDKs (Go, Python, Rust, .NET, Java) now reach parity with the TypeScript SDK's PKA domain-binding profile: they send `AID-Domain` by default for v2 PKA, verify the `aid-pka-v2-db` tag and `"aid-domain";req` covered component, and surface a `domainBound` result (Rust verifies and rejects identically; surfacing `domainBound` through Rust discovery is a fast-follow). Unbound `aid-pka-v2` proofs remain valid.
