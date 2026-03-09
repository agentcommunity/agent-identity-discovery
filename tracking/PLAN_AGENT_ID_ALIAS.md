# agent-id npm Alias Package

## Status: CODE COMPLETE — blocked on npm name dispute

**Branch:** `feat/agent-id-alias`
**Date:** 2026-03-10

## What this is

`agent-id` is a thin unscoped npm alias for `@agentcommunity/aid`. It lets users write `pnpm add agent-id` instead of the scoped name. The package contains only two files (`index.js` and `index.d.ts`) that re-export everything from `@agentcommunity/aid`.

## What was done (all complete)

| Area | Status | Details |
|------|--------|---------|
| Package skeleton | Done | `packages/agent-id/` — index.js, index.d.ts, README.md, package.json |
| Workspace wiring | Done | `workspace:*` dep, `exports` map, `publishConfig.access: "public"` |
| Version lockstep | Done | `.changeset/config.json` `linked` array pairs both packages |
| Release workflow | Done | Comment in `.github/workflows/release.yml` lists `agent-id` |
| Changeset | Done | `.changeset/agent-id-alias.md` exists |
| Docs | Done | README.md, packages/aid/README.md, quickstart/index.md, quickstart_ts.md, quickstart_browser.md all mention the alias |
| CLAUDE.md | Done | Package table row added |
| npm publish | **BLOCKED** | See below |

## Why it's blocked

npm rejected `agent-id` because the name normalizes to `agentid`, which is taken by a squatter:

```
agentid@0.0.1 | ISC | deps: none | versions: 1
maintainers: quuu <qual1337@gmail.com>
published 6 months ago — 451 bytes, no readme, no code
```

**Two disputes filed (pending):**
1. **`agentid`** — squatter package, 0.0.1, no code. Once transferred/removed, `agent-id` becomes publishable.
2. **`aid`** — stale package. If won, could be used as an even shorter alias in the future.

## What to do when the dispute is resolved

### Once `agentid` is removed (unblocks `agent-id`):

```bash
# From repo root, on this branch (or after merging to main):
cd packages/agent-id
pnpm pack
npm publish agent-id-1.2.0.tgz --access public
```

### Then configure OIDC Trusted Publishing on npmjs.com:

Go to https://www.npmjs.com/package/agent-id/access and add:
- Repository: `agentcommunity/agent-identity-discovery`
- Workflow: `release.yml`
- Environment: `pypi` (matches the existing workflow environment field)

This enables CI to publish future versions automatically via `changeset publish`.

### If `aid` is also won:

Create a second alias package `packages/aid/` (separate from `packages/aid` which is the core SDK — would need a different directory name like `packages/aid-alias/`). Or just reserve the npm name and redirect users. Decide later.

## Architecture notes

- **No build step** — agent-id has no `src/`, no tsup, no compilation. Just static JS/TS files.
- **turbo.json** — no changes needed. Turbo only runs scripts that exist in package.json.
- **pnpm-workspace.yaml** — `packages/*` glob auto-includes agent-id.
- **Changesets `linked`** — both `@agentcommunity/aid` and `agent-id` always get the same version bump.
- **pnpm `workspace:*`** — resolves locally during dev, replaced with real version (e.g., `1.2.0`) at publish time.
- **Not a spec extension** — this is purely npm distribution. No protocol/constants/multi-language changes needed.

## Commits on this branch

```
37daa24 docs: add agent-id alias to aid README, fix agent-id usage example
edea6f2 docs: mention agent-id shorthand alias in install instructions
7639096 docs: add agent-id to CLAUDE.md package table
bbc091a chore(agent-id): wire changesets linked config, release workflow, and changeset
372b310 fix(agent-id): use workspace dep, add exports map and publishConfig
```
