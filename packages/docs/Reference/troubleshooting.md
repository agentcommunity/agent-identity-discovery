---
title: 'Troubleshooting'
description: 'DNS propagation, TTL, and common AID errors (1000–1005)'
icon: material/tools
---

# Troubleshooting

## DNS propagation

- Try multiple resolvers: `dig @1.1.1.1 TXT _agent.<domain>`, `dig @8.8.8.8 ...`.
- Check authoritative NS directly (from your registrar/host).
- Allow several minutes; some providers cache for longer.

## TTL & caching

- Recommended TTL: 300–900 seconds.
- Clients may cache up to the DNS TTL.
- For testing, lower TTL temporarily; raise for production.

## Common errors

- 1000 ERR_NO_RECORD: `_agent.<domain>` TXT not found
  - Add at subdomain `_agent` (not apex). Verify propagation.
- 1001 ERR_INVALID_TXT: malformed record
  - Required keys for new records: `v=aid2;uri=...;proto=<token>`.
  - Legacy `v=aid1` records remain accepted only for backward compatibility.
  - Use `proto` (preferred) or `p` (shorthand), not both.
  - Remote URIs must be `https://` and parseable.
- 1002 ERR_UNSUPPORTED_PROTO: unsupported `proto`
  - Use a registered protocol token (see [Protocols & Auth](protocols.md)): `mcp`, `a2a`, `openapi`, `grpc`, `graphql`, `websocket`, `local`, `zeroconf`, `ucp`.
- 1003 ERR_SECURITY: security policy violation
  - DNSSEC failures, invalid local execution, disallowed scheme, failed PKA proof, or domain-binding policy rejection (see Domain-binding failures below).
- 1004 ERR_DNS_LOOKUP_FAILED: DNS/network timeout/failure
  - Retry, try different resolver, increase client timeout.
- 1005 ERR_FALLBACK_FAILED: .well-known fetch failed/invalid
  - Ensure `/.well-known/agent` exists, returns JSON, and uses HTTPS.

## PKA handshake failures (checklist)

For v2 records:

- Invalid key: `k`/`pka` is not unpadded base64url or does not decode to a 32-byte Ed25519 public key
- `keyid` mismatch: header `keyid` does not equal the RFC 7638 JWK thumbprint derived from `k`
- Nonce mismatch: response `nonce` does not exactly match the client challenge
- Timestamp skew: `created`/`expires` is missing, expired, or too far from the client clock
- Covered fields mismatch: ensure the response signature covers `"@method";req`, `"@target-uri";req`, `"@authority";req`, and `"@status"`

### Domain-binding failures

`domain-binding=require` causes `ERR_SECURITY` in two cases:

- **Unbound proof returned:** the endpoint signed `aid-pka-v2` with the base covered set, omitting `"aid-domain";req`. The endpoint may not support domain binding. Check whether the server implements the B.7 profile. Under `domain-binding=prefer` (default), an unbound proof is accepted and `domainBound` in the result is `false`.
- **Endpoint refused with 403:** the endpoint supports domain binding but does not serve the queried domain. This means the DNS record points to a different operator's endpoint — an unauthorized association. Verify that the `uri` in the AID record belongs to the domain's own infrastructure.

To confirm whether an endpoint supports domain binding, send a manual PKA request with `AID-Domain: <domain>` and an `Accept-Signature` whose covered set includes `"aid-domain";req` (tag `aid-pka-v2`). If the response `Signature-Input` contains `aid-pka` with `"aid-domain";req` in the covered components, binding is supported. The `aid-doctor` CLI reports this as `domain-bound` in human output and as `domainBound: true` in JSON.

For legacy v1 compatibility records:

- Missing covered fields: ensure exactly `"AID-Challenge" "@method" "@target-uri" "host" "date"`
- Algorithm mismatch: `alg` must be `ed25519`
- Timestamp skew: `created` or HTTP `Date` outside ±300 seconds
- `keyid` mismatch: header `keyid` does not equal record `kid` (quotes allowed)
- Invalid key: `pka` not `z...` base58btc or not 32‑byte Ed25519 public key

## Quick checks

- CLI: `aid-doctor check <domain>` or `aid-doctor json <domain>`.
- Web: aid.agentcommunity.org/workbench.
- For comprehensive diagnostics, use the [aid-doctor CLI](../Tooling/aid_doctor.md) which provides detailed validation, security checks, and PKA verification.

## See also

- [Quick Start index](../quickstart/index.md)
- [Protocols & Auth Tokens](protocols.md)
- [Conformance](../Tooling/conformance.md)
