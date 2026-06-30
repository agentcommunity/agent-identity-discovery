# @agentcommunity/aid-doctor

## 2.1.0

### Minor Changes

- 0717dd4: Make PKA domain binding the default. Discovery sends `AID-Domain` by default (`domain-binding=prefer`) and exposes `domainBound`; a new `domain-binding: off | prefer | require` policy lets clients require domain-bound proofs (the `strict` preset now requires them). `aid-doctor` shows domain-bound vs endpoint-proof-only, persists `domainBound` (cache schema v3), warns on binding loss, and accepts `--domain-binding`. Unbound `aid-pka-v2` proofs remain valid, so existing deployments are unaffected. The spec marks domain binding as optional-but-default with an `aid3` mandate trajectory.
- 0717dd4: Introduce PKA domain binding. During discovery the client sends the queried domain in an `AID-Domain` request header by default; endpoints that support binding cover it in the RFC 9421 response signature by adding `"aid-domain";req` to the `aid-pka-v2` covered set (`domain-binding=prefer` default, `require` enforces it). Discovery results expose `pka.domainBound` (`true` only when `aid-domain` is covered and verified). `aid-doctor` now sends `AID-Domain` when verifying v2 endpoints and reports whether the proof is domain-bound. Plain `aid-pka-v2` proofs without `aid-domain` coverage remain valid unbound proofs, so existing deployments are unaffected.

### Patch Changes

- Updated dependencies [0717dd4]
- Updated dependencies [0717dd4]
- Updated dependencies [0717dd4]
  - @agentcommunity/aid@2.1.0
  - @agentcommunity/aid-engine@2.1.0

## 2.0.1

### Patch Changes

- Fix the installed `aid-doctor` bin so symlinked package-manager shims execute the CLI instead of no-oping.

## 2.0.0

### Major Changes

- Align the CLI with the v2 AID contract, including `aid2` record generation, v2 PKA diagnostics, and legacy `aid1` compatibility handling.
- Add deeper action-path tests for check, generate, PKA, cache, security-state, and fallback flows.
- Improve validation output for v2 endpoint proof, downgrade state, DNSSEC policy, and `.well-known` fallback behavior.

### Patch Changes

- Updated dependencies
  - @agentcommunity/aid@2.0.0
  - @agentcommunity/aid-engine@2.0.0

## 1.2.0

### Minor Changes

- Align with the v1.2.0 release line.

### Patch Changes

- Updated dependencies
  - @agentcommunity/aid@1.2.0
  - @agentcommunity/aid-engine@0.2.2

## 1.1.1

### Patch Changes

- Updated dependencies [e3929c1]
  - @agentcommunity/aid-engine@0.2.1

## 1.1.0

### Minor Changes

- 0f3e163: feat(aid-doctor): world-class CLI rework – base-first discovery, strict spec validation (v1.1), TLS inspection + redirect policy, DNSSEC presence probe, PKA presence, downgrade cache, JSON report, interactive generator, and PKA key helpers. Added E2E harness and docs.
- 0f3e163: feat: v1.1 discovery parity across SDKs
  - DNS-first discovery with protocol-specific flow on request
  - Optional `.well-known` JSON fallback (HTTPS-only, JSON, ≤64KB, ~2s timeout, no redirects; TTL=300 on success)
  - Optional PKA endpoint proof (Ed25519 HTTP Message Signatures)
  - TypeScript: unchanged API; Python: optional camelCase kwargs aliases; Go/Rust: options form added; .NET/Java: new top-level discover APIs
  - Docs updated (Quickstarts, Discovery API Reference)

### Patch Changes

- Updated dependencies [0f3e163]
- Updated dependencies [0f3e163]
- Updated dependencies [0f3e163]
  - @agentcommunity/aid-engine@0.2.0
  - @agentcommunity/aid@1.1.0

## 1.0.0

### Major Changes

- 6d75a59: feat!: first stable release – v1.0.0

### Patch Changes

- Updated dependencies [6d75a59]
  - @agentcommunity/aid@1.0.0
