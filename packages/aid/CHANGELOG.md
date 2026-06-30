# @agentcommunity/aid

## 2.1.0

### Minor Changes

- 0717dd4: Make PKA domain binding the default. Discovery sends `AID-Domain` by default (`domain-binding=prefer`) and exposes `domainBound`; a new `domain-binding: off | prefer | require` policy lets clients require domain-bound proofs (the `strict` preset now requires them). `aid-doctor` shows domain-bound vs endpoint-proof-only, persists `domainBound` (cache schema v3), warns on binding loss, and accepts `--domain-binding`. Unbound `aid-pka-v2` proofs remain valid, so existing deployments are unaffected. The spec marks domain binding as optional-but-default with an `aid3` mandate trajectory.
- 0717dd4: Introduce PKA domain binding. During discovery the client sends the queried domain in an `AID-Domain` request header by default; endpoints that support binding cover it in the RFC 9421 response signature by adding `"aid-domain";req` to the `aid-pka-v2` covered set (`domain-binding=prefer` default, `require` enforces it). Discovery results expose `pka.domainBound` (`true` only when `aid-domain` is covered and verified). `aid-doctor` now sends `AID-Domain` when verifying v2 endpoints and reports whether the proof is domain-bound. Plain `aid-pka-v2` proofs without `aid-domain` coverage remain valid unbound proofs, so existing deployments are unaffected.

### Patch Changes

- 0717dd4: All official SDKs (Go, Python, Rust, .NET, Java) now reach parity with the TypeScript SDK's PKA domain-binding profile: they send `AID-Domain` by default for v2 PKA, verify the `"aid-domain";req` covered component on an `aid-pka-v2` signature, and surface a `domainBound`/`domain_bound` result. Unbound `aid-pka-v2` proofs without `aid-domain` coverage remain valid.

  Note: this entry bumps `@agentcommunity/aid` as a version marker only — the TS SDK code is unchanged. The substantive changes are in the Go, Python, Rust, .NET, and Java packages, which are not Changesets-managed.

## 2.0.0

### Major Changes

- Make `aid2` the current default record version while preserving legacy `aid1` compatibility.
- Add v2 PKA endpoint proof using RFC 9421 response signatures, Ed25519 JWK `x` keys, derived RFC 7638 `keyid`, nonce freshness, `created`, `expires`, and `Cache-Control: no-store`.
- Add version-aware parser, discovery, security policy, `.well-known`, and downgrade handling for the v2 contract.
- Regenerate constants and parity fixtures from the v2 protocol contract.

## 1.2.0

### Minor Changes

- Add `ucp` protocol token support in generated constants and parser validation.

## 1.1.0

### Minor Changes

- 0f3e163: feat(aid): align TS client with v1.1 spec
  - Implement spec-compliant protocol resolution logic (underscore prefix only).
  - Add `.well-known` fallback to browser client for feature parity.
  - Add handling for `dep` (deprecation) field with warnings and errors.
  - Refactor `canonicalizeRaw` into shared parser module.
  - Add comprehensive tests for new features and compliance fixes.

- 0f3e163: feat: v1.1 discovery parity across SDKs
  - DNS-first discovery with protocol-specific flow on request
  - Optional `.well-known` JSON fallback (HTTPS-only, JSON, ≤64KB, ~2s timeout, no redirects; TTL=300 on success)
  - Optional PKA endpoint proof (Ed25519 HTTP Message Signatures)
  - TypeScript: unchanged API; Python: optional camelCase kwargs aliases; Go/Rust: options form added; .NET/Java: new top-level discover APIs
  - Docs updated (Quickstarts, Discovery API Reference)

## 1.0.0

### Major Changes

- 6d75a59: feat!: first stable release – v1.0.0
