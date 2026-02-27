---
title: 'Discovery API'
description: 'Cross-language discover() options and behaviors'
icon: material/magnify-scan
---

# Discovery API (v1.2)

Cross-language parity for AID `discover()` wrappers with consistent security and fallback behavior.

## Common behaviors

- IDNA: Normalize domains to A-label (Punycode) before DNS.
- DNS-first: Query `_agent.<domain>`. When `protocol` is specified, try `_agent._<proto>.<domain>` then `_agent.<proto>.<domain>` before base.
- TXT parsing: Enforce v1.2 record rules (aliases, schemes, metadata constraints).
- Multiple TXT answers: exactly one valid AID record at a queried DNS name succeeds; `2+` valid records fail as ambiguity instead of using resolver order.
- PKA: When `pka`/`kid` present, perform Ed25519 HTTP Message Signatures handshake with exact covered fields set.
- Well-known fallback: Only on `ERR_NO_RECORD` or `ERR_DNS_LOOKUP_FAILED`. HTTPS JSON, ≤64KB, ~2s timeout, no redirects. Successful fallback uses `TTL=300`.
- Redirect policy: Do not auto-follow redirects for handshake or well-known.

## Options by language

- TypeScript/Node: `{ protocol?: string; timeout?: number; wellKnownFallback?: boolean; wellKnownTimeoutMs?: number }`
- Python: `discover(domain, *, protocol=None, timeout=5.0, well_known_fallback=True, well_known_timeout=2.0)`
  - Accepts camelCase aliases `wellKnownFallback` and `wellKnownTimeoutMs` (deprecated with warnings)
- Go: `DiscoverWithOptions(domain string, timeout time.Duration, opts DiscoveryOptions)`
  - `DiscoveryOptions{ Protocol string; WellKnownFallback bool; WellKnownTimeout time.Duration }`
- Rust: `discover_with_options(domain: &str, options: DiscoveryOptions)`
  - `DiscoveryOptions { protocol: Option<String>, timeout: Duration, well_known_fallback: bool, well_known_timeout: Duration }`
- .NET: `Discovery.DiscoverAsync(string domain, DiscoveryOptions? options = null)`
  - `DiscoveryOptions { string? Protocol; TimeSpan Timeout; bool WellKnownFallback; TimeSpan WellKnownTimeout }`
- Java: `Discovery.discover(String domain, DiscoveryOptions options)`
  - `DiscoveryOptions { String protocol; Duration timeout; boolean wellKnownFallback; Duration wellKnownTimeout }`

## Error codes

- `1000` `ERR_NO_RECORD` – No `_agent` TXT record found
- `1001` `ERR_INVALID_TXT` – Malformed record
- `1002` `ERR_UNSUPPORTED_PROTO` – Unsupported `proto`
- `1003` `ERR_SECURITY` – Security policy violation
- `1004` `ERR_DNS_LOOKUP_FAILED` – DNS/network failure
- `1005` `ERR_FALLBACK_FAILED` – `.well-known` fetch invalid/failed

## Notes

- Loopback relax: allowed only for `.well-known` fallback and only on loopback hosts; env/flag gated per language (never for TXT).
- Rust PKA is behind the `handshake` feature; enable it to run handshake verification.
- Test your implementation using the [aid-doctor CLI](../Tooling/aid_doctor.md) tool for real-world validation.

## See also

- [Quick Start index](../quickstart/index.md)
- [Specification](../specification.md)
- [Troubleshooting](./troubleshooting.md)
- [.well-known JSON](./well_known_json.md)
