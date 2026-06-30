# AID v1.0.0 Post-Release TODO (Prioritized)

> **Historical document.** This roadmap was written against v1.0.0. AID v2.0.0 is now normative (shipped 2026-06-01). Items referencing `v=aid1` schema enforcement, `proto xor p`, or v1-specific semantics should be read in that context; equivalent work for v2 targets `v=aid2`. `.cursorrule` references below are superseded by `CLAUDE.md` and `AGENTS.md`.

This updates the earlier roadmap based on the v1.0.0 specification. Order: spec conformance → security/reliability → CLI/CI → docs/adoption → showcase → language ports → governance. Keep `protocol/constants.yml` as the single source of truth.

## Open priorities (ordered)

1) P0 — Spec Conformance & Interop
- JSON Schema for AID record and CI validation
- Error semantics parity across TS/Py/Go
- Redirect policy helper parity (implement in Py/Go)

2) P1 — Security & Reliability
- DNSSEC options (require/prefer) surfaced in CLI and libraries
- DoH provider fallback/rotation with jitter/backoff
- IDN safety hints in CLI
- Local execution guidance docs

3) P2 — CLI & CI Ergonomics
- `aid-doctor` batch input (stdin/file) and `--format yaml|plain`
- GitHub Action (`aid-validate`)
- Coverage/static checks and SBOM/audit jobs

4) P3 — Documentation & Adoption
- New language port guide
- Registrar playbooks
- Examples gallery (`examples/_agent.<domain>.txt`)

5) P4 — Showcase & Terraform
- Cloudflare provider module
- Propagation checks

6) P5 — Language Ports
- Tier 1 criteria verification (parity + conformance green) as needed

7) P6 — Governance & Registries
- Token registry repo
- Global index/crawler

---

## Recently completed

- Parity CI job (multi-language)
- CI language builds for Tier 1 ports (Rust/.NET/Java)
- Pre-commit lint scope tightened
- Web toolkit reflects new ports
- Security best practices page and cross-links

## P0 — Spec Conformance & Interop (highest priority)

- [ ] JSON Schema for AID record (spec §2.1)
  - Publish `@agentcommunity/aid-schema` and include schema in docs.
  - Enforce: `v=aid1`, `proto` xor `p`, `desc` ≤ 60 bytes (UTF-8), `https://` for remote protocols, local scheme allowlist.
  - CI validates fixtures and samples against the schema.

- [ ] Error semantics parity (spec §2.3 table; Appendix C)
  - Ensure symbol → numeric mapping and messages match across TS, Python, Go.

- [ ] Redirect policy helper parity (spec §3)
  - Provide Python and Go equivalents to TS `enforceRedirectPolicy` with tests and usage docs.

- [wontdo] Protocol-specific subdomain format (spec §2.4)
  - Decision for v1: keep discovery base-only at `_agent.<domain>`; do not implement protocol-specific subdomain lookups.
  - Rationale: Avoid duplication/complexity until there is clear demand; revisit for v2.

- [ ] JSON Schema for AID record (spec §2.1)
  - Publish `@agentcommunity/aid-schema` and include schema in docs.
  - Enforce: `v=aid1`, `proto` xor `p`, `desc` ≤ 60 bytes (UTF-8), `https://` for remote protocols, local scheme allowlist.
  - CI validates fixtures and samples against the schema.

- [x] Conformance suite package
  - Externalize golden fixtures plus a small runner as `@agentcommunity/aid-conformance` so third-party ports can run parity.
  - Status: Implemented and pushed (fixtures + runner + README + changeset).

- [ ] Error semantics parity (spec §2.3 table; Appendix C)
  - Ensure symbol → numeric mapping and messages match across TS, Python, Go.

- [ ] Redirect policy helper parity (spec §3)
  - Provide Python and Go equivalents to TS `enforceRedirectPolicy` with tests and usage docs.

## P1 — Security & Reliability

- [ ] DNSSEC options (spec §3)
  - CLI: `--require-dnssec`, `--prefer-dnssec`.
  - Libraries: at minimum expose AD-bit from DoH responses; document full validation paths per language.

- [ ] DoH provider fallback/rotation
  - Support multiple DoH providers (Cloudflare, Google, Quad9) with jitter/backoff; env-configurable.

- [ ] IDN safety hints
  - Aid-doctor warns on potential confusables/homoglyph risks.

- [ ] Local execution guidance (spec §3)
  - Provide guidance/snippets for host apps: consent, fingerprinting, no shell interpretation, sandboxing.

## P2 — CLI & CI Ergonomics

- [ ] Aid-doctor outputs and batch
  - Add `--yaml` and `--plain` (JSON exists), batch from file/stdin, consistent exit codes for CI.

- [ ] GitHub Action
  - `aid-validate` action: validate domains, DNSSEC options, batch input.

- [ ] Coverage & static analysis
  - TS: coverage thresholds. Go: `staticcheck` + `govulncheck`. Python: `ruff`, `mypy`, add `py.typed`.

- [ ] SBOM & dependency audit
  - Emit CycloneDX SBOM; add periodic audit jobs for JS, Python, and Go.

- [x] Parity CI job (multi-language)
  - Added root `test:parity` and a dedicated CI job running TS/Py/Go parity.

- [x] CI language builds for Tier 1 ports (Rust/.NET/Java)
  - Added separate Rust (`cargo build/test`), .NET (`dotnet build/test`), and Java (`./gradlew build test`) jobs; preserved `pnpm gen` gen-check and existing parity job.

- [x] Pre-commit lint scope tightened
  - Scoped lint-staged globs to repo paths only (`packages/**`, `protocol/**`, `scripts/**`, root README, `.github/**`) to avoid external file traversal and reduce pre-commit noise.

## P3 — Documentation & Adoption

- [x] Web toolkit reflects new ports
  - Landing Toolkit updated with Rust/Java/.NET WIP cards linking to repo paths; kept existing cards and styles.

- [ ] New language port guide
  - Scaffold, acceptance criteria, parity instructions, publishing checklist.

- [ ] Registrar playbooks
  - Cloudflare, Route53, Vercel, GCP, Azure: screenshots, TTL 300–900 s, propagation tips.

- [x] Security best practices
  - DNSSEC, redirect handling, IDN safety, local-exec safeguards, TTL & client caching expectations.
  - Status: Added `packages/docs/security.md` and cross-links to index and quickstart.

- [ ] Examples gallery
  - Add `examples/_agent.<domain>.txt` samples with multiple protocol/auth variants per `.cursorrule`.

## P4 — Showcase & Terraform

- [ ] Cloudflare provider module (in addition to Vercel)
  - Parameterize TTL; output record URLs; emphasize canonical base `_agent.<domain>` TXT records.

- [ ] Propagation checks
  - Simple verification script/CI step post-apply with retries.

## P5 — Language Ports (tiered)

- Tier 1: Rust, C#/.NET, Java
  - Criteria: generated constants (via `pnpm gen`), parser error parity, conformance suite green, README + examples. Discovery later.
  - Generator support: added optional emitters for Rust/.NET/Java; safe no-op if packages absent.
- Tier 2: Swift, Kotlin, Ruby, PHP, Elixir (based on demand)

## P6 — Governance & Registries (spec §6)

- [ ] Token registry repo (`aid-tokens`)
  - PR template and review policy for token additions.

- [ ] Global index/crawler (`aid-registry`)
  - Minimal `_agent` TXT crawler and seed dashboard with a privacy statement.

## Cross-cutting

- [ ] Tracking hygiene
  - Unify `tracking/PHASE_4.md` casing (all-caps). Keep status entries consistent.

- [ ] Docs links audit
  - Ensure README links for `SECURITY.md`, `CODE_OF_CONDUCT.md` resolve; add files if missing.

---

## Suggested execution order

1. P0 Spec Conformance (JSON Schema, error parity, redirect helper parity)
2. P1 Security & Reliability (DNSSEC options, DoH rotation, IDN hints, local-exec guidance)
3. P2 CLI & CI (batch/outputs, GitHub Action, coverage/static checks, SBOM/audits)
4. P3 Docs & Adoption (port guide, registrar playbooks, examples)
5. P4 Showcase & Terraform (Cloudflare module, propagation checks)
6. P5 Language Ports (Rust/C#/Java → then Swift/Kotlin/Ruby/PHP/Elixir)
7. P6 Governance & Registries (aid-tokens, aid-registry)

Rationale: close spec gaps first to prevent drift, harden security, improve automation, accelerate adoption, then expand language coverage and governance.

---

## Acceptance & PR checklist addendum

- Include unit tests (and integration/E2E where relevant).
- Update docs if public API or behavior changes.
- Add a Changeset and pass `turbo run build test lint`.
- Confirm adherence to `.cursorrule` and reference relevant spec sections.

---

## Branching plan (execution)

Create small, focused branches/PRs and publish in one release train:

- fix/discovery-order
  - Make base `_agent.<domain>` canonical; keep protocol-specific as optional; no breaking changes.
- docs/protocol-subdomains
  - Clarify optional nature of protocol-specific subdomains; emphasize base record.
- feat/aid-conformance
  - New package with fixtures + runner + README.
- ci/parity-gates
  - Wire parity tests for TS/Py/Go; enforce error-code/message parity.
- chore/terraform-showcase (optional)
  - Ensure examples emphasize base record; adjust underscore examples if kept.

Release strategy:

- Merge the above into a short-lived `release/1.0.1` branch; run Changesets to publish one patch for core libs.
- Publish `@agentcommunity/aid-conformance` as a new package.

## Spec extension process

Moved to `tracking/SPEC_EXTENSION_PROCESS.md`.
