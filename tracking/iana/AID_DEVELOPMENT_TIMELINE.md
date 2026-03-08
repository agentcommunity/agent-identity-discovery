# AID Development Timeline

This timeline is derived from repository history and focuses on milestones that matter to IANA and expert review.

## Timeline

| Date | Commit / Marker | Milestone | Why it matters |
| --- | --- | --- | --- |
| 2025-07-06 | `598d095` | Core AID implementation lands | Establishes the protocol as a concrete implementation effort |
| 2025-07-06 | `a58fc40` | TTL and DNSSEC guidance added | Shows early DNS publication and trust model work |
| 2025-07-08 | `3b97756` | Workbench and public launch work completes | Shows public-facing tooling around discovery |
| 2025-07-10 | `619eef2` | Spec and web plumbing continue | Indicates sustained implementation, not a one-day experiment |
| 2025-07-11 | `905587b` | Release-final fixes land | Marks pre-release stabilization |
| 2025-07-12 | package tag date | `@agentcommunity/aid@1.0.0` and `@agentcommunity/aid-doctor@1.0.0` | Shows packaging and external distribution readiness |
| 2025-08-09 | `09c8113` | Protocol subdomain guidance added | Documents `_agent._<proto>.<domain>` usage |
| 2025-08-29 | `327541f` | `packages/web/src/spec-adapters/index.ts` and `v1.ts` added | Strong evidence of a versioned consumer contract |
| 2025-09-03 | `0f3e163` | AID v1.1 spec lands | Confirms formal protocol evolution |
| 2025-10-06 | `864befb` | Examples work lands | Indicates deployment and demonstration material around the protocol |
| 2026-02-05 | `2e7aeab` | `ucp` protocol token added | Shows controlled extension of protocol token space |
| 2026-02-23 | `84107f0` | v1.2 labels and version-drift enforcement added | Tightens cross-artifact consistency |
| 2026-02-27 | `17999e3` | Ambiguous multi-TXT behavior fixed | Improves deterministic client interoperability |
| 2026-02-27 | `12db3b7` | Exact-host lookup semantics codified | Narrows the meaning and operational scope of `_agent` |
| 2026-02-27 | `88aa685` | Enterprise policy presets added | Strengthens deployment and security posture |
| 2026-02-27 | `56cbfa8` | Short-key canonical emission added | Stabilizes wire-format output for v1.x |
| 2026-03-08 | current working tree | IANA annex, plan, and RFCXML draft refreshed | Packages the protocol for formal IANA and I-D submission |

## Phase Summary

### Phase 1: Initial protocol definition

- July 2025 establishes `_agent.<domain>` TXT discovery as a concrete implementation.
- DNS TTL and DNSSEC guidance appear immediately in the project lifecycle.

### Phase 2: Tooling and public implementation

- July to August 2025 expands the workbench, CLI, and web-facing implementation.
- The project stops being just a spec draft and becomes an interoperable toolchain.

### Phase 3: Versioned protocol surface

- August 2025 introduces `packages/web/src/spec-adapters/index.ts`.
- That file explicitly selects `v1Adapter`, proving the implementation already treats AID as a versioned protocol with a stable adapter boundary.

### Phase 4: Protocol evolution and hardening

- September 2025 to February 2026 delivers v1.1, then v1.2.
- The February 2026 work is especially relevant to IANA because it hardens exact-host behavior, ambiguity handling, enterprise policy controls, and canonical short-key output.

## Why This Timeline Matters

For IANA and designated expert review, the important conclusion is simple:

- AID has a long-enough implementation history to demonstrate stable semantics.
- `_agent` is not being invented for this filing. It is the already-used discovery label of the protocol.
- The project has enough versioning discipline to justify a stable registry entry.

## Reproduce

```bash
git log --date=short --pretty=format:'%ad %h %s' --follow -- packages/docs/specification.md
git log --date=short --pretty=format:'%ad %h %s' --follow -- protocol/constants.yml
git log --date=short --pretty=format:'%ad %h %s' --follow -- packages/web/src/spec-adapters/index.ts
git tag --sort=creatordate --format='%(creatordate:short) %(refname:strip=2)'
```
