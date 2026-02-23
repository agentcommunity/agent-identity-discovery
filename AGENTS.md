# AGENTS.md

Single source of truth for humans and coding agents. Subprojects can override with their own AGENTS.md. Agents read the nearest file.

## Project overview
- Monorepo: PNPM + Turborepo
- SDKs: TypeScript `packages/aid`, Go `packages/aid-go`, Python `packages/aid-py`, Rust `packages/aid-rs`, .NET `packages/aid-dotnet`, Java `packages/aid-java`
- Workbench UI: `packages/web` (Next.js). CLI: `packages/aid-doctor`
- Spec source of truth: `protocol/constants.yml`
- Normative docs: `packages/docs/specification.md`
- Workbench architecture: `packages/web/WORKBENCH_COMPONENTS.md`

## Repo structure

```
.
├─ AGENTS.md
├─ protocol/
│  └─ constants.yml
├─ packages/
│  ├─ aid/            # TS SDK
│  ├─ aid-go/         # Go SDK
│  ├─ aid-py/         # Python SDK
│  ├─ aid-rs/         # Rust SDK
│  ├─ aid-dotnet/     # .NET SDK
│  ├─ aid-java/       # Java SDK
│  ├─ web/            # Workbench UI
│  └─ aid-doctor/     # CLI
├─ packages/docs/            # Documentation (rendered at /docs by web)
│  ├─ specification.md
│  ├─ Understand/            # Concepts, rationale, FAQ, comparison
│  ├─ quickstart/            # 11 language/protocol guides
│  ├─ Reference/             # API, protocols, security, versioning
│  └─ Tooling/               # aid-doctor, aid-engine, conformance
└─ packages/web/
   └─ WORKBENCH_COMPONENTS.md
```

## Quickstart
```bash
pnpm i
pnpm dev:core          # core libs
pnpm dev:web           # workbench -> http://localhost:3000
pnpm dev:all
```

## Build and test matrix

Top level

```bash
pnpm build
pnpm test
pnpm e2e
pnpm test:parity       # TS + Go + Python parity suite
```

Per SDK

```bash
pnpm -C packages/aid test && pnpm -C packages/aid run test:coverage
cd packages/aid-go && go test ./...
python3 -m pip install -e './packages/aid-py[dev]' && python3 -m pytest packages/aid-py
```

## Spec and codegen

* Edit `protocol/constants.yml` only.
* Then generate and commit YAML plus all generated outputs.

```bash
pnpm gen
```

Generated spec module (canonical): `protocol/spec.ts`.
Mirrored for Web (back-compat): `packages/web/src/generated/spec.ts`.

## Examples generation

* Edit `protocol/examples.yml` only for example records.
* Examples are generated for both Terraform deployment and Web UI.
* Includes PKA keys and v1.2 features across all examples.

Generated files:
- Terraform: `showcase/terraform/examples.tf`
- Web constants: `packages/web/src/generated/examples.ts`

TS SDK must export these names from `packages/aid/src/constants.ts`:

```
DNS_SUBDOMAIN
DNS_TTL_MIN
DNS_TTL_MAX
LOCAL_URI_SCHEMES
RawAidRecord
```

### v1.2 notes (Final)

- Release baseline: `packages/docs/specification.md` is v1.2.0.
- Contract baseline: `protocol/constants.yml` schemaVersion is 1.2.0.
- New keys: `docs` (`d`), `dep` (`e`), `pka` (`k`), `kid` (`i`).
- Aliases: clients must accept single-letter keys for all fields.
- PKA: if `pka` is present, clients must perform the handshake (RFC 9421 + Ed25519).
- Fallback: clients may query `/.well-known/agent` on DNS failure.

## Workbench and CLI

Workbench

```bash
pnpm -C packages/web dev
```

Engine may raise `needs_auth`. Provide token. Engine retries once then emits `connection_result`.

CLI

```bash
pnpm -C packages/aid-doctor build && node packages/aid-doctor/dist/cli.js check <domain>
pnpm -C packages/aid-doctor dev
pnpm i -g @agentcommunity/aid-doctor && aid-doctor check <domain>
```

For complete CLI documentation, see the [aid-doctor CLI Reference](packages/docs/Tooling/aid_doctor.md).

## Code style

* TypeScript strict, target ES2022, 2 space indent, lowercase or kebab file names, prefer named exports
* Build with `tsup` to ESM and CJS with d.ts
* ESLint with `unicorn` and Prettier via Husky and lint-staged
* Tests: `*.test.ts` and `*_test.go`
* Writing style for docs: short sentences, no em dash, use active voice

## Testing instructions

* From any package root: `pnpm test`
* Focus a test: `pnpm vitest run -t "<name>"`
* Lint one package: `pnpm lint --filter <pkg>`

## Security

* Never commit secrets. Use `.env.local` for Workbench.
* DNS edits change trust. Follow `packages/docs/specification.md` for `_agent.<domain>` TXT.
* Keep TTL within `DNS_TTL_MIN`..`DNS_TTL_MAX`.
* If a record includes `pka`, perform the handshake before use.
* `.well-known` is optional and TLS-anchored. Use DNS first.

## Commits and PRs

* Conventional commits. Example: `feat(aid): add DoH client`
* Add a Changeset for user visible changes
* PRs must pass `turbo run build test lint`, include tests, and update docs
* Update `tracking/PHASE_X.md` if applicable

## Extending the Spec

When adding new protocol features (tokens, fields, rules), follow `tracking/SPEC_EXTENSION_PROCESS.md`.
