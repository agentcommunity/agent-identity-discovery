# @agentcommunity/aid-doctor

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
