# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Agent Identity & Discovery (AID) is a DNS-based standard for discovering AI agent services. Given a domain, query `_agent.<domain>` TXT record to find its agent endpoint. The protocol supports MCP, A2A, OpenAPI, gRPC, GraphQL, and WebSocket.

This is a PNPM + Turborepo monorepo with SDKs in 6 languages plus a Next.js web workbench and CLI tool.

## Common Commands

```bash
# Install and build
pnpm install
pnpm build                    # Build all packages
pnpm test                     # Run all tests
pnpm lint                     # Lint all code

# Development
pnpm dev:core                 # Watch core libs (aid + aid-doctor)
pnpm dev:web                  # Watch web workbench (http://localhost:3000)

# Per-language testing
pnpm -C packages/aid test                           # TypeScript
cd packages/aid-go && go test ./...                 # Go
python3 -m pytest packages/aid-py                   # Python
pnpm test:parity                                    # TS + Go + Python together

# Run a single test
pnpm vitest run -t "<test name>"                    # TS (from package dir)

# Constants generation (after editing protocol/constants.yml)
pnpm gen                      # Regenerates constants for all languages

# CLI tool
pnpm -C packages/aid-doctor build && node packages/aid-doctor/dist/cli.js check <domain>
```

## Architecture

### Source of Truth

- **Protocol constants**: `protocol/constants.yml` - edit this, then run `pnpm gen`
- **Specification docs**: `packages/docs/specification.md`
- **Documentation**: `packages/docs/` — rendered by `packages/web` at `/docs`. Navigation driven by `meta.json` files. Sections: Understand, Quick Start, Reference, Tooling.

### Package Structure

| Package | Purpose |
|---------|---------|
| `packages/aid` | Core TypeScript SDK (Node.js + Browser) |
| `packages/aid-engine` | Pure business logic (stateless, no side effects) |
| `packages/aid-doctor` | CLI wrapper around aid-engine (handles I/O) |
| `packages/aid-go` | Go SDK |
| `packages/aid-py` | Python SDK (published as `aid-discovery` on PyPI) |
| `packages/aid-rs` | Rust SDK |
| `packages/aid-dotnet` | .NET SDK |
| `packages/aid-java` | Java SDK |
| `packages/docs` | Markdown documentation (rendered by web at `/docs`) |
| `packages/web` | Next.js workbench UI + docs renderer |
| `packages/e2e-tests` | E2E tests against live domains |

### Key Architecture Decisions

- **aid-engine vs aid-doctor separation**: Pure functions in engine, side effects in doctor. This makes engine easily testable and reusable.
- **Contract-first**: All protocol constants come from YAML, generated into each language via `pnpm gen`.
- **tsup for builds**: Outputs both ESM and CJS with type declarations.

## Code Style

- TypeScript strict mode with `exactOptionalPropertyTypes`
- No `any` - use `unknown` with runtime guards
- 2-space indent, lowercase/kebab file names, named exports
- Tests: `*.test.ts` (TS), `*_test.go` (Go)
- ESLint + Prettier via Husky pre-commit hooks

## Commits and PRs

- Conventional commits: `feat(aid):`, `fix(web):`, `chore(ci):`
- Add a Changeset for user-visible changes: `pnpm changeset`
- PR checklist: tests, `turbo run build test lint`, changeset, docs update, `tracking/PHASE_X.md` update

## Project Tracking

- Phase tracking files: `tracking/PHASE_0.md` through `tracking/PHASE_4.md`
- Master plan: `TODO.md`

## Extending the Spec

When adding new protocol features (tokens, fields, rules), follow `tracking/SPEC_EXTENSION_PROCESS.md`.

## v1.1 Protocol Notes

- DNS-first with protocol-specific subdomains: `_agent._<proto>.<domain>`
- Well-known fallback (`/.well-known/agent`) only on DNS failure
- PKA (Public Key Attestation): Ed25519 HTTP Message Signatures (RFC 9421)
- Key aliases for byte efficiency: `v,p,u,s,a,d,e,k,i`
