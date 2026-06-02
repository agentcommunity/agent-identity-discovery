# @agentcommunity/aid

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
