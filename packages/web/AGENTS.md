# AGENTS.md

## Deployment

Cloudflare Workers via `@opennextjs/cloudflare`. Worker `agentcommunity-aid` on Taqanu account. Deploy: `pnpm deploy:cf` from `main` (auto via CF Workers Builds). Build chain: `build:cf:deps` (Turbo builds workspace deps `@agentcommunity/aid` + `@agentcommunity/aid-engine` first) → `opennextjs-cloudflare build` → `wrangler deploy`. Full context: `docs/admin/CLOUDFLARE-MIGRATION.md` in the `agentcommunity_page` repo.

## Dev

```bash
pnpm -C packages/web dev
# http://localhost:3000
```

## Generated spec

Canonical generated module: `protocol/spec.ts`.
This app consumes a mirrored copy at `src/generated/spec.ts`. Do not edit either.
Change `protocol/constants.yml` and run `pnpm gen`.

## Engine behavior

- May emit `needs_auth`
- Accept a token, retry once
- Emits `connection_result` with success or error

## Notes

- Spec adapters live in `src/spec-adapters/` (start from `v1.ts`)
- Keep UI types mapped through adapters only
