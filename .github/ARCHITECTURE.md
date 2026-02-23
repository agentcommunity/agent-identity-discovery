# Agent Identity & Discovery - Architecture Documentation

> **Why this matters:** Understanding the architectural decisions behind this monorepo ensures consistent development practices and enables future contributors to extend the project effectively.

## 🏗️ Monorepo Structure

### Package Organization

```
packages/
├── aid/                    # Core TypeScript library (published to npm)
├── aid-engine/            # Pure business logic library (published to npm)
├── aid-doctor/            # CLI validation and generation tool (published to npm)
├── aid-py/               # Python SDK (published to PyPI as aid-discovery)
├── aid-go/               # Go SDK (module)
├── aid-rs/               # Rust SDK (parser + discovery, feature-gated handshake)
├── aid-dotnet/           # .NET SDK (parser + discovery + PKA)
├── aid-java/             # Java SDK (parser + discovery + PKA)
├── docs/                 # Markdown documentation (rendered by web at /docs)
├── web/                  # Next.js web interface + docs renderer (private)
└── e2e-tests/            # End-to-end tests against live records (private)

# NOTE: The official Python package is currently published at https://pypi.org/project/aid-discovery/ and is not yet community-owned. Community transfer is planned.

```

### Why This Structure?

1. **Language Separation**: Each implementation lives in its own package with language-specific tooling
2. **Publication Control**: Core libraries are published, implementation tests and demos remain private
3. **Dependency Clarity**: Clear boundaries prevent circular dependencies
4. **Development Experience**: Each package can be developed independently while sharing common build tools

## 🛠️ Build System Architecture

### Turbo Monorepo Orchestration

**Decision**: Use Turbo for build orchestration instead of Lerna or Rush.

**Why Turbo**:

- **Performance**: Intelligent caching with dependency-aware builds
- **Simplicity**: Minimal configuration for maximum impact
- **Remote Caching**: Built-in support for team and CI cache sharing
- **Input Hashing**: Only rebuilds what actually changed

**Key Configuration**:

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**", "tsup.config.ts", "package.json", "..."]
    }
  }
}
```

### TypeScript Build Strategy

**Decision**: Use tsup for all TypeScript packages instead of tsc directly.

**Why tsup**:

- **Dual Output**: Generates both ESM and CJS automatically
- **Bundle Optimization**: Tree-shaking and minification out of the box
- **Developer Experience**: Hot reloading for development
- **Type Generation**: Automatic .d.ts files with source maps

**Base Configuration Pattern**:

```typescript
// All packages extend this base config
export const baseConfig = defineConfig({
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  target: 'es2022',
});
```

### Spec Code Generation

**Decision**: Use a single YAML source of truth (`protocol/constants.yml`) and generate language-specific constants and types, including a Web-only module for the Next.js app.

**Outputs (via `pnpm gen`)**:

- TypeScript (core): `packages/aid/src/constants.ts`
- TypeScript (web): `packages/web/src/generated/spec.ts` (small, tree‑shakeable; types + maps used by UI)
- Python: `packages/aid-py/aid_py/constants.py`
- Go: `packages/aid-go/constants_gen.go`
- Rust: `packages/aid-rs/src/constants_gen.rs`
- .NET: `packages/aid-dotnet/src/Constants.g.cs`
- Java: `packages/aid-java/src/main/java/org/agentcommunity/aid/Constants.java`

The web module is consumed by the UI via a thin adapter layer that normalizes spec-shaped data into canonical types, insulating the UI from spec churn.

### v1.1 Discovery Parity (Core Architecture)

- DNS-first discovery across all SDKs with IDNA normalization to A-label (Punycode) prior to queries.
- Protocol-specific flow (when requested): `_agent._<proto>.<domain>` → `_agent.<proto>.<domain>` → base `_agent.<domain>`.
- Strict TXT parsing per spec: aliases, scheme enforcement, metadata validation.
- PKA handshake (when `pka`/`kid` present): Ed25519 HTTP Message Signatures; exact covered fields set; time window ±300s; `alg=ed25519`; normalized `keyid==kid`.
- Well-known fallback guards: only on `ERR_NO_RECORD` or `ERR_DNS_LOOKUP_FAILED`; HTTPS only; content-type `application/json` prefix; ≤64KB; ~2s timeout; no redirects; TTL=300 on success.
- Redirect policy: no auto-follow in security-sensitive paths (handshake, well-known fetch).
- Loopback relax: permitted only for well-known path, loopback-only, and feature-gated (env/flag) per language; never for TXT.

Language specifics

- Node.js: native DNS; Browser: DNS-over-HTTPS; both export the same API.
- Go/Rust: added options forms while keeping legacy wrappers for back-compat.
- .NET/Java: high-level discovery wrappers added; DoH used for DNS; compose with well-known + PKA.

### Cross-Platform Compatibility

**Decision**: Use rimraf instead of `rm -rf` for all clean scripts.

**Why**: Ensures Windows/Mac/Linux compatibility without conditional scripts.

**Implementation**:

- Added `rimraf` as root dependency
- All packages use `"clean": "rimraf dist"`
- Avoids shell-specific commands

## 📦 Package Management

### PNPM Workspace Strategy

**Decision**: Use PNPM with workspaces instead of npm or Yarn.

**Why PNPM**:

- **Disk Efficiency**: Global content-addressable store
- **Strict Dependencies**: Prevents phantom dependencies
- **Workspace Support**: First-class monorepo support
- **Performance**: Faster installs than npm/yarn

**Workspace Configuration**:

```json
{
  "workspaces": ["packages/*"],
  "engines": {
    "node": ">=18.17",
    "pnpm": ">=8.0.0"
  }
}
```

### Version Management

**Decision**: Use Changesets for version coordination.

**Why Changesets**:

- **Semantic Versioning**: Automatic version bumps based on change type
- **Changelog Generation**: Human-readable release notes
- **Workspace Awareness**: Handles inter-package dependencies
- **CI Integration**: Automated releases via GitHub Actions

## 🔒 Security & Quality

### Node Version Enforcement

**Files**:

- `.nvmrc` (for nvm users)
- `.node-version` (for nodenv users)
- `engines` field in all package.json files

**Why**: Prevents Node version drift that causes subtle build/runtime issues.

### Dependency Protection

**Strategy**: Private packages marked as `"private": true` with `"publishConfig": {"access": "restricted"}`.

**Why**: Prevents accidental publication of test runners and development tools.

### Type Safety

**Configuration**: Strict TypeScript with `exactOptionalPropertyTypes` enabled.

**Why**: Catches more bugs at compile time, especially with external API integration.

## 🚀 Development Workflow

### Package Scripts Standardization

**Every JS package has**:

```json
{
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "clean": "rimraf dist",
    "prepack": "turbo run build --filter=."
  }
}
```

**Why Standardized**:

- **Predictability**: Any developer can work on any package
- **Tool Integration**: IDEs and CI can rely on consistent commands
- **Maintenance**: Easier to update tooling across all packages

### Development Commands

```bash
# Start core library development
pnpm dev:core

# Start web interface only
pnpm dev:web

# Build everything
pnpm build

# Run all tests (where available)
pnpm test
```

## 🧪 Testing Strategy

### Multi-Language Testing

**TypeScript**: Vitest for unit tests
**Python**: pytest for implementation tests
**Go**: native `go test` for implementation tests
**E2E**: Custom runner against live DNS records

**Why Different Tools**: Each language uses its ecosystem's best practices rather than forcing a single tool.

### Test Isolation

**Decision**: Tests run in package-specific environments.

**Benefits**:

- **Faster Feedback**: Only affected packages run tests
- **Environment Control**: Language-specific test setups
- **Parallel Execution**: Turbo runs compatible tests simultaneously

### aid-doctor CLI E2E Harness

- Package: `packages/e2e-tests`
- Entrypoints:
  - `src/aid_doctor.e2e.ts` – JSON smoke checks against showcase domains, spawns the built CLI (`packages/aid-doctor/dist/cli.js`)
  - `src/pka_e2e.ts` – Loopback HTTP server that serves a `.well-known/agent` JSON and signs a valid PKA handshake for local testing
- Run locally:
  ```bash
  pnpm -C packages/aid-doctor build
  pnpm -C packages/e2e-tests e2e
  pnpm -C packages/e2e-tests e2e:pka
  ```
-
- CI note: The checker honors `AID_SKIP_SECURITY=1` to skip TLS inspection in smoke runs; PKA loopback uses `AID_ALLOW_INSECURE_WELL_KNOWN=1` (loopback only) for local HTTP testing.

### aid-doctor CLI Architecture

**Core Architecture Pattern**: Clean separation between pure business logic (`aid-engine`) and side-effectful CLI wrapper (`aid-doctor`).

#### **@agentcommunity/aid-engine** (Pure Core Library)

A stateless, pure library containing all AID business logic:

- **Discovery Logic**: DNS resolution, TXT record parsing, well-known fallback handling
- **Validation Engine**: Record format validation, protocol verification, security checks
- **PKA Handshake**: Ed25519 HTTP Message Signatures implementation with time window validation
- **Protocol Support**: MCP, A2A, OpenAPI, GraphQL, gRPC, WebSocket, Zeroconf
- **Error Handling**: Standardized error codes and messages across all operations
- **Type Safety**: Full TypeScript interfaces with exact optional property types

**Why Pure**: No filesystem access, no network I/O beyond DNS/well-known, deterministic behavior.

#### **@agentcommunity/aid-doctor** (CLI Wrapper)

A thin command-line interface that orchestrates the engine:

- **State Management**: Filesystem caching, configuration persistence
- **User Interaction**: Commander.js CLI, interactive prompts, clipboard integration
- **Key Management**: PKA key generation and storage in `~/.aid/keys/`
- **Output Formatting**: Human-readable reports with actionable suggestions
- **Side Effects**: All I/O operations (file writes, network calls beyond DNS)

**Enhanced Features (v1.1)**:

- **Draft Saving**: Interactive wizard supports `--save-draft <path>` for saving generated records to files
- **PKA Key Management**: Integrated key generation and verification with proper file system handling
- **Enhanced Diagnostics**: Actionable suggestions, detailed TLS/PKA reporting, and byte size warnings
- **Comprehensive Test Coverage**: Full unit tests for all CLI functionality (6/6 tests passing)

#### **Module Structure**

**aid-engine (packages/aid-engine/)**:

- `checker.ts` – Core discovery and validation logic (stateless)
- `generator.ts` – Record generation logic (pure functions)
- `dns.ts` – DNS resolution utilities
- `tls_inspect.ts` – TLS certificate validation
- `pka.ts` – PKA handshake implementation
- `protoProbe.ts` – Protocol-specific subdomain probing
- `types.ts` – TypeScript interfaces for all data structures
- `error_messages.ts` – Centralized error message constants

**aid-doctor (packages/aid-doctor/)**:

- `cli.ts` – Commander.js setup with all commands and flags
- `output.ts` – Human-readable formatting with actionable suggestions
- `keys.ts` – PKA key generation and filesystem storage (side-effectful)
- `cache.ts` – Cache persistence to `~/.aid/cache.json` (side-effectful)
- `index.ts` – Package entry point

## 📖 Documentation Architecture

Documentation lives in `packages/docs/` as markdown files with YAML frontmatter, rendered by the Next.js app at `/docs`.

**Navigation**: Driven by `meta.json` files at each level. Root `meta.json` defines top-level pages and groups; each group directory has its own `meta.json` with page ordering.

**Sections**:

- **Root**: Landing page (`index.md`) and specification
- **Understand**: Concepts, rationale, FAQ, comparison guides
- **Quick Start**: 11 language and protocol-specific guides
- **Reference**: Protocols, discovery API, PKA, security, versioning, troubleshooting
- **Tooling**: aid-doctor CLI, aid-engine library, conformance suite

**Rendering features**: MDX via `next-mdx-remote`, frontmatter-driven metadata (title, description, icon), admonitions (`!!! type`), mermaid diagrams (client-side rendered), scroll-spy TOC, heading copy-links, and raw markdown API at `/api/docs/[slug]`.

## 🔄 CI/CD Architecture

### Build Optimization

**Strategy**: Turbo caching with selective package builds.

**Implementation**:

- Only builds packages that changed (input hashing)
- Caches successful builds for reuse
- Parallel execution where dependencies allow

### Publishing Strategy

**Automated Releases**:

1. Developer creates changeset: `pnpm changeset`
2. CI runs tests on PR
3. Merge to main triggers version bump
4. Automated npm publish for public packages

### Parity CI

To prevent ecosystem drift across languages, CI includes a dedicated parity job:

- Setup Node/PNPM, Python 3.11 (pytest), and Go toolchain
- Install workspace deps with caching
- Run the root `test:parity` script which executes:
  - TypeScript unit/parity tests
  - Go `go test ./...`
  - Python `pytest` for `packages/aid-py`

The parity job runs on PRs and main to ensure spec compliance across TS/Py/Go. Additional jobs cover Rust/.NET/Java including PKA vectors and well-known fallback checks.

### Language-specific CI jobs (Rust / .NET / Java)

In addition to the parity job, CI runs language-specific build and test jobs:

- Rust (packages/aid-rs)
  - Setup Rust stable
  - Cache cargo
  - `cargo build --locked`
  - `cargo test --locked`
- .NET (packages/aid-dotnet)
  - Setup .NET 8 with cache
  - `dotnet restore`
  - `dotnet build -c Release`
  - `dotnet test -c Release --no-build`
- Java (packages/aid-java)
  - Setup JDK 21 (Temurin) with Gradle cache
  - Use repo root Gradle wrapper from package dir: `../../gradlew build test`

These jobs run independently of JS/TS/Python/Go and help validate new ports as they evolve.

## 📋 Design Principles

### 1. **Fail Fast**

- Strict TypeScript prevents runtime errors
- Engine requirements prevent environment issues
- Linting catches style/logic issues early

### 2. **Developer Experience**

- Hot reloading for fast iteration
- Consistent commands across packages
- Clear error messages with suggested fixes

### 3. **Production Ready**

- Cross-platform compatibility tested
- Multiple output formats (ESM/CJS)
- Automated version management

### 4. **Scalable Architecture**

- New packages follow established patterns
- Shared configuration reduces duplication
- Language-agnostic where possible

## 🔮 Future Considerations

### Adding New Languages

**Pattern**: Create `packages/aid-{language}/` with:

- Language-specific build tools
- Private package.json for test running (if needed)
- Implementation following core specification

Generator support

- The single entrypoint `pnpm gen` reads `protocol/constants.yml` and emits constants for TS, Python, Go, and (optionally) Rust/.NET/Java if their package folders exist.
- Outputs (auto-generated; do not edit):
  - Rust → `packages/aid-rs/src/constants_gen.rs`
  - .NET → `packages/aid-dotnet/src/Constants.g.cs`
  - Java → `packages/aid-java/src/main/java/org/agentcommunity/aid/Constants.java`
- Formatters are run best-effort (`gofmt`, `rustfmt`) when available; generation is a safe no‑op if the target package is absent.

Minimal scope for a new port

- Parser + generated constants + parity tests first
- DNS/Network discovery can follow later

### Remote Caching

**Setup**: Configured but disabled by default.

**Activation**: Run `npx turbo login` and `npx turbo link` for team cache sharing.

### Migration Strategy

**When changing architecture**:

1. Update this document first
2. Create migration guide
3. Update one package as example
4. Roll out to remaining packages
5. Update CI/CD pipelines last

---

This architecture balances **simplicity** (easy to understand), **performance** (fast builds/tests), and **maintainability** (consistent patterns). Every decision prioritizes long-term project health over short-term convenience.
