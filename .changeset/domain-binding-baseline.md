---
'@agentcommunity/aid': minor
'@agentcommunity/aid-engine': minor
'@agentcommunity/aid-doctor': minor
---

Make PKA domain binding the default. Discovery sends `AID-Domain` by default (`domain-binding=prefer`) and exposes `domainBound`; a new `domain-binding: off | prefer | require` policy lets clients require domain-bound proofs (the `strict` preset now requires them). `aid-doctor` shows domain-bound vs endpoint-proof-only, persists `domainBound` (cache schema v3), warns on binding loss, and accepts `--domain-binding`. Unbound `aid-pka-v2` proofs remain valid, so existing deployments are unaffected. The spec marks domain binding as optional-but-default with an `aid3` mandate trajectory.
