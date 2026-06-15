---
'@agentcommunity/aid': minor
'@agentcommunity/aid-engine': minor
'@agentcommunity/aid-doctor': minor
---

Add the optional PKA domain-binding profile. During discovery the client sends the queried domain in an `AID-Domain` request header; endpoints that support the profile cover it in the RFC 9421 response signature by adding `"aid-domain";req` to the `aid-pka-v2` covered set, letting them refuse to attest for domains they do not serve. Discovery results expose `pka.domainBound`, and `aid-doctor` now sends `AID-Domain` when verifying v2 endpoints. Plain `aid-pka-v2` proofs without `aid-domain` coverage remain valid unbound proofs, so existing deployments are unaffected.
