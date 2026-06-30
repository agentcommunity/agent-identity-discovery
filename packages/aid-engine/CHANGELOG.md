# @agentcommunity/aid-engine

## 2.1.0

### Minor Changes

- 0717dd4: Make PKA domain binding the default. Discovery sends `AID-Domain` by default (`domain-binding=prefer`) and exposes `domainBound`; a new `domain-binding: off | prefer | require` policy lets clients require domain-bound proofs (the `strict` preset now requires them). `aid-doctor` shows domain-bound vs endpoint-proof-only, persists `domainBound` (cache schema v3), warns on binding loss, and accepts `--domain-binding`. Unbound `aid-pka-v2` proofs remain valid, so existing deployments are unaffected. The spec marks domain binding as optional-but-default with an `aid3` mandate trajectory.
- 0717dd4: Introduce PKA domain binding. During discovery the client sends the queried domain in an `AID-Domain` request header by default; endpoints that support binding cover it in the RFC 9421 response signature by adding `"aid-domain";req` to the `aid-pka-v2` covered set (`domain-binding=prefer` default, `require` enforces it). Discovery results expose `pka.domainBound` (`true` only when `aid-domain` is covered and verified). `aid-doctor` now sends `AID-Domain` when verifying v2 endpoints and reports whether the proof is domain-bound. Plain `aid-pka-v2` proofs without `aid-domain` coverage remain valid unbound proofs, so existing deployments are unaffected.

### Patch Changes

- Updated dependencies [0717dd4]
- Updated dependencies [0717dd4]
- Updated dependencies [0717dd4]
  - @agentcommunity/aid@2.1.0

## 2.0.0

### Major Changes

- Generate `aid2` records by default and keep legacy `aid1` generation/validation behavior explicit.
- Add v2-aware checker output, PKA key generation guidance, canonical short-key emission, and enterprise security policy handling.
- Update validation messages and protocol-probing helpers for base-first v2 discovery.

### Patch Changes

- Updated dependencies
  - @agentcommunity/aid@2.0.0

## 0.2.2

### Patch Changes

- Handle non-OK discovery results in `runCheck()` before dereferencing the success value.

- Updated dependencies
  - @agentcommunity/aid@1.2.0

## 0.2.1

### Patch Changes

- e3929c1: Patch to deploy V1.1 Agent Interface Community

## 0.2.0

### Minor Changes

- 0f3e163: feat(aid-engine): make aid-engine a public NPM package
  - Remove "private": true from package.json
  - Add comprehensive README.md for NPM page
  - Pure business logic library for AID discovery, validation, and PKA
  - 25+ unit tests covering all functionality
  - No side effects, deterministic behavior
  - Designed for custom integrations and server-side applications

### Patch Changes

- Updated dependencies [0f3e163]
- Updated dependencies [0f3e163]
  - @agentcommunity/aid@1.1.0
