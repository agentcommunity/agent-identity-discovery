# AID IANA Evidence Annex

## Purpose

This annex compiles reproducible evidence for two requested registrations:

- `_agent` in the IANA "Underscored and Globally Scoped DNS Node Names" registry under RFC 8552
- `agent` as a service-name-only entry in the IANA "Service Name and Transport Protocol Port Number" registry under RFC 6335

The goal is to show that AID is not a speculative label. It is a documented, implemented, versioned protocol with stable semantics and active multi-language implementation work.

## Canonical Sources

The strongest evidence in this repository is the consistency between the spec source of truth, generated outputs, and consuming implementations.

| Artifact | Role | Why it matters for IANA |
| --- | --- | --- |
| `protocol/constants.yml` | Protocol source of truth | Shows the protocol fields, aliases, and versioned schema baseline in one canonical source |
| `packages/docs/specification.md` | Normative public specification | States the protocol rules, security model, exact-host semantics, and the requested IANA registrations |
| `protocol/spec.ts` | Generated canonical spec module | Proves the spec is machine-consumed, not just prose |
| `packages/web/src/generated/spec.ts` | Mirrored generated spec for the Workbench | Shows deployed consumers depend on a stable AID record shape |
| `packages/web/src/spec-adapters/index.ts` | Version-selection entry point | Proves the web implementation treats AID as a versioned protocol surface |
| `packages/web/src/spec-adapters/v1.ts` | Current production adapter | Confirms the active implementation normalizes a v1 record with `uri`, `proto`, `desc`, `auth`, and extension fields |

## Core Claim

The `_agent` label is already the stable discovery label for AID. The record semantics are specific, narrow, and versioned:

- AID uses a TXT record at `_agent.<domain>` across both published protocol versions
- The required record members are version, endpoint URI, and protocol token
- The current deployed version is `aid2` (normative since v2.0.0, June 2026); `aid1` remains a supported legacy compatibility version
- The label remains `_agent` even as the record schema evolves across protocol versions
- Protocol-specific descendants such as `_agent._mcp.<domain>` remain subordinate names under `_agent`

That label stability across record-version evolution is exactly the type of narrowly scoped, protocol-specific meaning that RFC 8552 expects. The `_agent` label has proven stable through two major protocol versions (aid1 → aid2), strengthening the case that it represents a durable, well-scoped registration.

## Verifiable Milestones

The following milestones are derived from repository history and can be reproduced with `git log`.

| Date | Commit | Artifact | Evidence | IANA relevance |
| --- | --- | --- | --- | --- |
| 2025-07-06 | `598d095` | Core protocol implementation | Commit message: `feat(core): Complete Phase 1 implementation of AID standard (#2)` | Earliest clear repository evidence that AID was implemented as a concrete protocol |
| 2025-07-06 | `a58fc40` | DNS TTL and DNSSEC guidance | Commit message references TTL and DNSSEC updates | Shows early operational focus on DNS publication and security |
| 2025-07-12 | tag date | `@agentcommunity/aid@1.0.0` and `@agentcommunity/aid-doctor@1.0.0` | `git tag --sort=creatordate` shows package tags dated 2025-07-12 | Demonstrates packaging and distribution around the protocol surface |
| 2025-08-09 | `09c8113` | Protocol subdomain guidance | Commit message: `Docs/protocol subdomains (#48)` | Shows `_agent._<proto>` naming was documented well before the current IANA filing package |
| 2025-08-29 | `327541f` | Web spec adapters | Commit message: `feat(web,workbench): add spec adapters and generated web spec; ... (#64)` | Strong evidence that AID became a versioned, implementation-facing interface |
| 2025-09-03 | `0f3e163` | AID v1.1 spec | Commit message: `Feat/aid1.1 spec (#65)` | Shows ongoing versioned protocol evolution rather than a one-off draft |
| 2026-02-05 | `2e7aeab` | Protocol token growth | Commit message: `feat(protocol): add ucp protocol token (#78)` | Shows the protocol registry is maintained and extended in a controlled way |
| 2026-02-23 | `84107f0` | v1.2 alignment and drift checks | Commit message: `chore(docs): align v1.2 labels and enforce version drift checks (#87)` | Proves cross-artifact version discipline |
| 2026-02-27 | `17999e3` | Ambiguous multi-TXT handling | Commit message: `fix(discovery): reject ambiguous multi-txt answers (#104)` | Shows the protocol behavior is precise enough for interoperable client failure handling |
| 2026-02-27 | `12db3b7` | Exact-host semantics | Commit message: `docs(discovery): codify exact-host lookup semantics (#105)` | Important to RFC 8552 review because it narrows the semantic scope of the label |
| 2026-02-27 | `88aa685` | Enterprise discovery policies | Commit message: `feat(security): add enterprise discovery policy presets (#106)` | Shows active hardening and operational deployment thinking |
| 2026-02-27 | `56cbfa8` | Short-key canonicalization | Commit message: `feat(format): canonicalize short-key emission (#109)` | Shows record format maturity and stable wire representation |

## Evidence From the Current Web Adapter

`packages/web/src/spec-adapters/index.ts` currently exports:

```ts
// The current UI adapter normalizes the stable app-facing shape used by aid1 and aid2 records.
export const selectAdapter = (_version?: string): SpecAdapter => v1Adapter;
```

This is useful evidence for IANA because it shows:

1. the protocol is explicitly versioned,
2. the deployed consumer surface is normalized around a stable shared adapter that handles both `aid1` (legacy) and `aid2` (current) records — a concrete demonstration of the label-stability argument, and
3. the maintainers maintain a stable discovery abstraction across protocol versions.

That is consistent with the spec's label-stability claim for `_agent` and is now validated by real two-version history (aid1 → aid2).

## Evidence From the Generated Type Surface

The generated AID record type in `protocol/spec.ts` (derived from `protocol/constants.yml`, the canonical source of truth) includes these v2 fields:

- required: `v`, `uri`, `proto`
- optional: `auth`, `desc`, `docs`, `dep`, `pka`
- recognized aliases in the raw record shape: `p`, `u`, `a`, `s`, `d`, `e`, `k`

The v1 legacy record additionally recognized `kid` / `i` (key-id field, superseded in v2 by a derived thumbprint). Implementations handle both schemas under the same `_agent` label, demonstrating that the DNS node name is stable across protocol evolution.

This is important because the requested DNS node name is not just a free-form convention. The repository encodes a concrete, versioned record schema consumed by six language implementations (TypeScript, Go, Python, Rust, .NET, Java).

## Stability Arguments Relevant to RFC 8552

The `_agent` request is narrowly scoped and should be evaluated as such:

- The label is specific to AID, not to all software agents in general.
- The node name is bound to one protocol family and one record grammar.
- The semantics are stable across versions because the label remains `_agent` and the record carries an explicit version field.
- Protocol-specific children such as `_agent._mcp.<domain>` are subordinate names under the requested label, not separate global claims.

## Stability Arguments Relevant to RFC 6335

The `agent` service name request is also narrowly scoped:

- No port number is requested.
- The request exists to reserve a stable service identifier for potential future SRV-style discovery under `_agent._tcp.<domain>`.
- The service-name request therefore complements, rather than duplicates, the RFC 8552 request.

## Reproducibility Commands

The annex can be independently reproduced with these commands:

```bash
git log --date=short --pretty=format:'%ad %h %s' --follow -- packages/docs/specification.md
git log --date=short --pretty=format:'%ad %h %s' --follow -- protocol/constants.yml
git log --date=short --pretty=format:'%ad %h %s' --follow -- packages/web/src/spec-adapters/index.ts
git tag --sort=creatordate --format='%(creatordate:short) %(refname:strip=2)'
```

## Recommended Filing Position

The strongest concise position for expert review is:

- `_agent` is already the stable, protocol-specific discovery label for AID.
- The protocol has an implemented record grammar, client algorithm, security model, and versioning story.
- The label semantics are narrow and precise.
- The service-name request is service-name-only and forward-looking, not an attempt to reserve a port.

That is the posture this repository now supports.
