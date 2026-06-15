---
'@agentcommunity/aid': minor
'@agentcommunity/aid-engine': minor
'@agentcommunity/aid-doctor': minor
---

Introduce PKA domain binding. During discovery the client sends the queried domain in an `AID-Domain` request header by default; endpoints that support binding cover it in the RFC 9421 response signature by adding `"aid-domain";req` to the `aid-pka-v2` covered set (`domain-binding=prefer` default, `require` enforces it). Discovery results expose `pka.domainBound` (`true` only when `aid-domain` is covered and verified). `aid-doctor` now sends `AID-Domain` when verifying v2 endpoints and reports whether the proof is domain-bound. Plain `aid-pka-v2` proofs without `aid-domain` coverage remain valid unbound proofs, so existing deployments are unaffected.
