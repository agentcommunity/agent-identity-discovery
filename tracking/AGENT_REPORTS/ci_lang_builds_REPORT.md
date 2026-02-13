Summary: Added CI jobs for Rust, .NET, and Java, preserved gen-check and parity job; aligned docs.

Files:

- `.github/workflows/ci.yml`
- `README.md`
- `.github/ARCHITECTURE.md`

Commands run (local):

- `pnpm install --frozen-lockfile`
- `pnpm gen && git diff --exit-code` (clean)
- `pnpm build && pnpm lint`
- `pnpm test` (JS/TS/Go ok; Python tests blocked by system pip policy in this environment)

Result:

- CI workflow updated to include `rust`, `.net`, and `java` jobs.
- Generator check remains in the main build job and passes locally.
- Docs updated to list WIP Rust/.NET/Java and document CI jobs and generator scope.

Timestamp: 2025-08-10T11:33:48Z

Notes:

- If any new language job flakes on CI, temporarily disable that job in the workflow while stabilizing.
- No generated files were edited directly; `pnpm gen` produces all language constants.

PR (create/view): https://github.com/agentcommunity/agent-identity-discovery/compare/main...ci/lang-builds?expand=1
