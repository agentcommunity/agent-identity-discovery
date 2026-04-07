# AID Showcase — Cloudflare Terraform

This directory publishes the live Agent Identity & Discovery (AID) showcase TXT records to the `agentcommunity.org` Cloudflare zone. It is the source of every `_agent.<sub>.agentcommunity.org` record you can resolve in production — `_agent.simple`, `_agent.grpc`, `_agent.pka-basic`, and so on.

The records here are operational, not illustrative. Deployment is fully automated by GitHub Actions on every push to `main`. There is no manual `terraform apply` step in normal operation.

## How records get to DNS

```
protocol/examples.yml          ← single source of truth (edit this)
        │
        │  pnpm gen
        ▼
showcase/terraform/examples.tf ← generated; do NOT edit by hand
        │
        │  terraform apply (via GitHub Actions, on push to main)
        ▼
Cloudflare DNS, agentcommunity.org zone
```

To add, change, or remove a showcase record:

1. Edit `protocol/examples.yml` at the repo root.
2. Run `pnpm gen` from the repo root. This regenerates `examples.tf` here, plus the parallel TypeScript constants used by the web workbench.
3. Commit both files. Open a PR. CI runs `terraform plan` against your branch (read-only — no CF changes).
4. On merge to `main`, the [`Showcase DNS`](../../.github/workflows/showcase-dns.yml) workflow purges the existing `_agent.*` TXT records and recreates the full set fresh.

## The purge-then-recreate cycle

Terraform state is **not** persisted between CI runs (no remote backend). On every push, terraform starts from an empty state file. To keep that empty state honest, the workflow first deletes every `_agent.*` TXT record in the zone via the Cloudflare API, then runs `terraform apply` to create the full set from `examples.yml` in one shot.

This sounds wasteful but is actually the cleanest option for a small showcase zone:

- **Self-healing.** Orphaned records, content drift, accidental duplicates — all gone every push.
- **No new infrastructure.** Uses only the existing `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ZONE_ID` GitHub secrets.
- **`examples.yml` is the truth.** Whatever's in YAML is what's in DNS, with no possibility of drift.

The previous strategy (`allow_overwrite = true` on the cloudflare_record resource) silently produced duplicate TXT records whenever a record's content changed, which then tripped the spec §2.3 "more than one valid AID record" ambiguity rule. See [#135](https://github.com/agentcommunity/agent-identity-discovery/pull/135) for the full root cause and the fix.

**Operational caveats:**

- Cloudflare record IDs rotate on every push. Don't reference them externally.
- There is a sub-second window during each apply when records are being recreated. Resolvers cache through it via the 360s TTL.
- Workflow runs only when files under `showcase/terraform/**` change. Editing `protocol/examples.yml` alone is not enough — `pnpm gen` must commit the regenerated `examples.tf`.

## Files

| File          | Purpose                                                                                                                                                    | Edit?                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `main.tf`     | Provider config, variables, the `cloudflare_record` resource that fans out across all showcase records, and the optional protocol-specific examples block. | Yes                                |
| `examples.tf` | Generated from `protocol/examples.yml` by `scripts/generate-examples.ts`. Holds the per-record `name`/`value` map.                                         | **No — regenerate via `pnpm gen`** |
| `README.md`   | This file.                                                                                                                                                 | Yes                                |

## Variables

Defined in `main.tf`:

| Variable                    | Type   | Default | Required | Description                                                                                                                                                                                                      |
| --------------------------- | ------ | ------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloudflare_zone_id`        | string | —       | yes      | Cloudflare zone ID for `agentcommunity.org`. In CI this comes from the `CLOUDFLARE_ZONE_ID` GitHub secret.                                                                                                       |
| `record_ttl`                | number | `360`   | no       | TTL in seconds for the published TXT records. Spec §4 recommends 300–900.                                                                                                                                        |
| `include_protocol_specific` | bool   | `false` | no       | If true, additionally creates the optional `_agent._mcp.simple` and `_agent._a2a.gateway` underscore-form examples described in spec §2.4. Off by default — the canonical `_agent.<sub>` records remain primary. |

The Cloudflare provider authenticates via the `CLOUDFLARE_API_TOKEN` environment variable.

## GitHub Actions integration

The workflow at [`.github/workflows/showcase-dns.yml`](../../.github/workflows/showcase-dns.yml):

- **On `pull_request`** (paths: `showcase/terraform/**`): runs `terraform init` + `terraform plan`. **Never touches CF.** This is the contributor feedback loop.
- **On `push` to `main`** (paths: `showcase/terraform/**`): runs the purge step, then `terraform apply -auto-approve -parallelism=2`.
- **On `workflow_dispatch`**: same as push-to-main. Use this if you need to manually re-reconcile the zone (e.g. after a manual edit in the CF dashboard) without making a code change.

The `-parallelism=2` cap exists to avoid Cloudflare API throttling under burst load (default is 10, which previously caused intermittent context-deadline-exceeded failures during the initial create burst).

GitHub secrets used by the workflow:

- `CLOUDFLARE_API_TOKEN` — scoped to the `agentcommunity.org` zone with DNS edit permission.
- `CLOUDFLARE_ZONE_ID` — the zone ID for `agentcommunity.org`.

## Local development

You generally do **not** want to `terraform apply` from a workstation — it would race with the CI cycle and produce duplicates exactly like the bug we just fixed. The only useful local command is plan-only validation.

```bash
# From repo root
cd showcase/terraform

# One-time setup
terraform init -backend-config=""

# Plan against the live zone (read-only). You need a CF API token with read
# permission and the real zone ID; do not commit either.
export CLOUDFLARE_API_TOKEN=<your-readonly-token>
terraform plan -var="cloudflare_zone_id=<zone-id>"

# Optional: preview the protocol-specific subdomain examples
terraform plan -var="cloudflare_zone_id=<zone-id>" -var="include_protocol_specific=true"

# Format check
terraform fmt -check
```

If you need to test record changes against a sandbox zone, point `cloudflare_zone_id` at a personal Cloudflare zone you own and apply there. **Never** apply against `agentcommunity.org` from a workstation.

## Spec alignment

The records published here demonstrate the complete AID v1.2 surface area. Relevant specification sections:

- **§2 — TXT Record Specification**: format, required keys, key aliases, multi-string handling.
- **§2.4 — Exact-host semantics and explicit delegation**: covered by the optional `include_protocol_specific` records.
- **§4 — DNS and Caching**: TTL recommendation enforced via `record_ttl`.
- **Appendix B — Protocol Registry**: every `proto` token in the registry has a representative showcase record (`mcp`, `a2a`, `openapi`, `grpc`, `graphql`, `local`, `ucp`).
- **Appendix D — PKA Handshake**: `_agent.pka-basic` exercises the live PKA endpoint.

The full spec lives at [`packages/docs/specification.md`](../../packages/docs/specification.md).

## Safety notes

- **No secrets in records.** TXT records are public. Anything emitted from `examples.yml` ends up world-readable in DNS.
- **Token scope.** The CI `CLOUDFLARE_API_TOKEN` is scoped to DNS edits on the single `agentcommunity.org` zone. It cannot reach other zones, Workers, R2, or any other Cloudflare product.
- **Branch protection.** Only pushes to `main` apply. PR builds are plan-only and cannot mutate DNS.

## Troubleshooting

| Symptom                                                                                                             | Likely cause                                                                      | Action                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `dig +short TXT _agent.<sub>.agentcommunity.org` returns two records                                                | Manual edit in CF dashboard plus stale state, or a pre-#135 deploy left an orphan | Trigger `Showcase DNS` via `gh workflow run "Showcase DNS" --ref main` — the purge step will collapse it back to one. |
| Workflow fails on `Terraform Apply` with `attempted to override existing record however didn't find an exact match` | Pre-#135 regression, or someone added `allow_overwrite=true` back to `main.tf`    | Confirm `main.tf` does not set `allow_overwrite`, then re-run the workflow.                                           |
| Workflow fails on `Purge stale _agent.* TXT records` with HTTP 401/403                                              | `CLOUDFLARE_API_TOKEN` secret expired or has wrong scope                          | Rotate the token in the Cloudflare dashboard, update the GitHub secret.                                               |
| `terraform plan` shows changes for records you didn't touch                                                         | `protocol/examples.yml` was edited but `pnpm gen` was not re-run, or vice versa   | Run `pnpm gen` from the repo root and commit the resulting `examples.tf`.                                             |

## References

- [Specification](../../packages/docs/specification.md) — AID v1.2.
- [`protocol/examples.yml`](../../protocol/examples.yml) — source of truth for showcase records.
- [`scripts/generate-examples.ts`](../../scripts/generate-examples.ts) — generator that emits `examples.tf` and the web constants.
- [`.github/workflows/showcase-dns.yml`](../../.github/workflows/showcase-dns.yml) — the CI deployment workflow.
- [PR #135](https://github.com/agentcommunity/agent-identity-discovery/pull/135) — purge-then-recreate cycle (current behavior).
- [PR #134](https://github.com/agentcommunity/agent-identity-discovery/pull/134) — spec-compliance fixes that surfaced the duplicate-records bug.
- [PR #126](https://github.com/agentcommunity/agent-identity-discovery/pull/126) — original Cloudflare migration (away from Vercel).
