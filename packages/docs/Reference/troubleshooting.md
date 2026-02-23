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
  - Required keys: `v=aid1;uri=...;proto=<token>`.
  - Use `proto` (preferred) or `p` (shorthand), not both.
  - Remote URIs must be `https://` and parseable.
- 1002 ERR_UNSUPPORTED_PROTO: unsupported `proto`
  - Use one of: `mcp`, `openapi`, `a2a`, `local`.
- 1003 ERR_SECURITY: security policy violation
  - DNSSEC failures, invalid local execution, or disallowed scheme.
- 1004 ERR_DNS_LOOKUP_FAILED: DNS/network timeout/failure
  - Retry, try different resolver, increase client timeout.
- 1005 ERR_FALLBACK_FAILED: .well-known fetch failed/invalid
  - Ensure `/.well-known/agent` exists, returns JSON, and uses HTTPS.

## PKA handshake failures (checklist)

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
