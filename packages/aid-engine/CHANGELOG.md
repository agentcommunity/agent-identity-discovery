# @agentcommunity/aid-engine

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
