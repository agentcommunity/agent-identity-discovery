# Product Requirements Document — AID SDK Discovery API Parity (v1.1)

Status: Proposed  
Owner: SDKs Working Group  
Editors: Agent Community  
Date: 2025-09-01

## Problem

SDKs expose different discovery APIs and option shapes. This causes friction, confusion, and extra work. .NET and Java lack a high-level `discover()` wrapper. Go and Rust options do not match other SDKs. Parameter names drift across languages.

## Goals

- Provide a consistent, ergonomic `discover()` API across TypeScript, Python, Go, Rust, .NET, and Java.
- Maintain v1.1 security: PKA, redirect policy, and HTTPS. Keep loopback relax only in the well-known fallback path and properly gated.
- Preserve backward compatibility.

## Non-Goals

- Change core parsing or validation beyond spec compliance.
- Broadly refactor networking stacks or public constants.
- Change Python naming style. Keep snake_case with compatibility shims if needed.

## Users

- SDK consumers who integrate AID discovery by domain.
- CI/CD flows using the doctor CLI and `discover()` for health checks.

## Scope

Applies to: `packages/aid` (TS), `packages/aid-py` (Python), `packages/aid-go` (Go), `packages/aid-rs` (Rust), `packages/aid-dotnet` (.NET), `packages/aid-java` (Java). Canonical constants and messages come from `protocol/spec.ts`.

## Functional Requirements

### Common Behavior

- IDNA: Normalize input domains to A-label (Punycode) before DNS.
- DNS-first lookup: Query `_agent.<domain>` by default.
- Protocol-specific lookup when requested: If options specify a protocol, query in order:
  1) `_agent._<proto>.<domain>`  
  2) `_agent.<domain>`
- Historical note: an earlier compatibility lookup at `_agent.<proto>.<domain>` was removed. Clients must not query that name.
- TXT parsing and validation: Enforce v1.1 rules. Support single-letter aliases. Enforce schemes per protocol. Validate metadata.
- PKA handshake: When `pka`/`kid` present, perform HTTP Message Signatures (RFC 9421) with Ed25519.
  - Covered fields set equality: {`AID-Challenge`, `@method`, `@target-uri`, `host`, `date`}.
  - Require `alg="ed25519"` and `keyid` equal (case-insensitive) to `kid`.
  - `created` and HTTP `Date` within ±300 seconds.
  - `pka` is multibase `z...` base58btc for a 32-byte public key.
  - Include port in `host` when present. Do not follow cross-origin redirects automatically.
- Well-known fallback:
  - Trigger only on `ERR_NO_RECORD` or `ERR_DNS_LOOKUP_FAILED`.
  - `GET https://<domain>/.well-known/agent`.
  - Content-Type must start with `application/json`.
  - Response size ≤ 64KB. Timeout ≈ 2s. No redirects.
  - On success, treat TTL as `DNS_TTL_MIN` (300).
- Loopback relax (dev-only, well-known path only):
  - TypeScript/doctor: gate by `AID_ALLOW_INSECURE_WELL_KNOWN=1` and only allow loopback hostnames/IPs (`localhost`, `127.0.0.1`, `::1`).
  - Java/.NET: expose `allowInsecure` boolean on WellKnown helper, and only allow loopback.
  - Never relax TXT path.
- Redirect security: Do not auto-follow cross-origin redirects for any discovery or handshake request. Return `ERR_SECURITY` or require explicit confirmation in apps.

### Error Codes and Messages (Canonical)

Use exact names, codes, and messages from `protocol/spec.ts`. Map 1:1 across languages.

- `1000` `ERR_NO_RECORD`: "No _agent TXT record was found for the domain"
- `1001` `ERR_INVALID_TXT`: "A record was found but is malformed or missing required keys"
- `1002` `ERR_UNSUPPORTED_PROTO`: "The record is valid, but the client does not support the specified protocol"
- `1003` `ERR_SECURITY`: "Discovery failed due to a security policy (e.g., DNSSEC failure, local execution denied)"
- `1004` `ERR_DNS_LOOKUP_FAILED`: "The DNS query failed for a network-related reason"
- `1005` `ERR_FALLBACK_FAILED`: "The .well-known fallback failed or returned invalid data"

## API Specification by Language

Follow language idioms for naming while aligning semantics.

### TypeScript (already present; keep)

```
discover(domain: string, options?: {
  protocol?: string;
  timeout?: number;            // keep name for back-compat
  wellKnownFallback?: boolean;
  wellKnownTimeoutMs?: number;
}): Promise<{ record: AidRecord; ttl: number; queryName: string }>
```

### Python (already present; keep idiomatic snake_case)

```
discover(
  domain: str,
  *,
  protocol: str | None = None,
  timeout: float = 5.0,
  well_known_fallback: bool = True,
  well_known_timeout: float = 2.0,
) -> DiscoveryResult
```

Optional: accept `wellKnownFallback` and `wellKnownTimeoutMs` as kwargs aliases with a deprecation warning.

### Go (enhance)

- Keep existing back-compat wrapper:
  ```go
  func Discover(domain string, timeout time.Duration) (AidRecord, uint32, error)
  ```
- Add options form:
  ```go
  type DiscoveryOptions struct {
    Protocol          string
    WellKnownFallback bool
    WellKnownTimeout  time.Duration
  }
  func DiscoverWithOptions(domain string, timeout time.Duration, opts DiscoveryOptions) (AidRecord, uint32, error)
  ```

### Rust (enhance; keep feature gate)

- Keep existing back-compat wrapper:
  ```rust
  async fn discover(domain: &str, timeout: Duration) -> Result<AidRecord, AidError>
  ```
- Add options form:
  ```rust
  pub struct DiscoveryOptions {
    pub protocol: Option<String>,
    pub timeout: Duration,
    pub well_known_fallback: bool,
    pub well_known_timeout: Duration,
  }
  pub async fn discover_with_options(domain: &str, options: DiscoveryOptions) -> Result<AidRecord, AidError>
  ```

### .NET (add high-level wrapper)

```csharp
public sealed class DiscoveryOptions {
  public string? Protocol;
  public TimeSpan Timeout = TimeSpan.FromSeconds(5);
  public bool WellKnownFallback = true;
  public TimeSpan WellKnownTimeout = TimeSpan.FromSeconds(2);
}
public static Task<DiscoveryResult> DiscoverAsync(string domain, DiscoveryOptions? options = null)
// DiscoveryResult { AidRecord Record; int Ttl; string QueryName; }
```

Internals: compose DNS-first + `WellKnown.FetchAsync(...)` and run PKA when present.

### Java (add high-level wrapper)

```java
public final class DiscoveryOptions {
  public String protocol;
  public Duration timeout = Duration.ofSeconds(5);
  public boolean wellKnownFallback = true;
  public Duration wellKnownTimeout = Duration.ofSeconds(2);
}
public static DiscoveryResult discover(String domain, DiscoveryOptions options)
// DiscoveryResult { AidRecord record; int ttl; String queryName; }
```

Internals: compose DNS-first + `WellKnown.fetch(...)` and run PKA when present.

## Option Naming Policy

- TS/Go/Rust/.NET/Java: camelCase.
- Python: snake_case; optionally accept camelCase aliases with warnings.
- Defaults: `timeout` ≈ 5000 ms, `wellKnownTimeout` ≈ 2000 ms, `wellKnownFallback` = true.

## Backward Compatibility

- TS, Python, Go, Rust: keep current signatures. Add options variants without breaking callers.
- Python: accept both snake_case and camelCase kwargs. Prefer snake_case in docs. Warn on camelCase usage.
- Do not rename or remove public constants. Do not change error messages.

## Acceptance Criteria

- API layers implemented in Go, Rust, .NET, and Java. TS and Python remain stable (Python may add aliases).
- Behavior parity:
  - IDNA normalization, protocol-specific DNS flow, strict TXT validation, guarded well-known fallback, PKA handshake.
  - TTL caching behavior. TTL = 300 for successful well-known fallback.
  - Error code parity (1000–1005) with exact messages.
  - Loopback relax only in well-known path and correctly gated.
- Conformance suite and doctor e2e remain green.

## Testing Strategy

- Unit/Integration:
  - Options coverage: protocol-specific underscore subdomain, base fallback, well-known toggles, timeouts.
  - PKA vectors unchanged. Ensure `host` includes port in covered fields.
- Parity tests: Conformance suite passes unchanged across SDKs.
- E2E: Doctor e2e remains green. Verify loopback relax behavior.

## Documentation

- Update per-SDK READMEs to show `discover()` with options.
- Quick Start: link to PKA handshake expectations.
- Troubleshooting: checklist for PKA failures.
- Doctor CLI in CI example: keep current guidance.

## Implementation Plan

- Go: Add `DiscoveryOptions` and `DiscoverWithOptions`. Implement protocol-specific DNS flow and well-known toggles. Keep `Discover(domain, timeout)` wrapper.
- Rust: Add `DiscoveryOptions` and `discover_with_options`. Wire to existing `discover` wrapper.
- .NET: Implement `DiscoverAsync` and `DiscoveryOptions`. Compose DNS + well-known + PKA.
- Java: Implement `DiscoveryOptions` and `Discovery.discover(...)`. Compose DNS + well-known + PKA.
- Python (optional): Accept camelCase `wellKnownFallback` and `wellKnownTimeoutMs` as kwargs synonyms.

## CI and Tooling

- Extend matrix to run new discover() tests in Go/Rust/.NET/Java.
- Keep drift gate and security scans green.

## Risks and Mitigations

- Larger API surface: Keep wrappers for back-compat.
- Naming consistency vs idioms: Respect language norms and document mappings.
- Local relax misuse: Keep gating to well-known and loopback only. Never relax TXT path.

## Timeline

- Phase 1 (2–3 days): Implement Go/Rust options. Add .NET/Java `discover()`.
- Phase 2 (2 days): Add tests, docs, and CI updates.
- Phase 3 (1 day): Final parity pass and release notes/Changesets.

---

References:  
- Canonical constants and error messages: `protocol/spec.ts`  
- Spec and PKA details: `packages/docs/specification.md` (Appendix D)  
- Proposed changes log: `tracking/SPEC_1.1_extension.md.md`
