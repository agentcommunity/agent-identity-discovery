---
'@agentcommunity/aid': minor
'@agentcommunity/aid-engine': minor
'@agentcommunity/aid-doctor': minor
---

Add the optional PKA domain-binding profile. During discovery the client sends the queried domain in an `AID-Domain` request header; endpoints that support the profile cover it in the RFC 9421 response signature (`tag="aid-pka-v2-db"`), letting them refuse to attest for domains they do not serve. Discovery results expose `pka.domainBound`, and `aid-doctor` now sends `AID-Domain` when verifying v2 endpoints. Plain `aid-pka-v2` responses remain valid unbound proofs, so existing deployments are unaffected.
