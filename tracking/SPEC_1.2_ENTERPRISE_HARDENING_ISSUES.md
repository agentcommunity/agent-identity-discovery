# SPEC v1.2 Enterprise Hardening Plan

Status: In progress
Owner: Agent Community
Updated: 2026-02-26
Branch context: `codex/spec12-enterprise-phased-plan`
Baseline PR: #90 (spec/docs/sdk alignment)

## Purpose
Track enterprise hardening work for AID v1.2.x after baseline alignment.

This file is the planning source of truth for:
- what already landed
- what still blocks enterprise readiness
- which GitHub issues exist already
- which GitHub issues still need to be opened or updated

This is not a claim that enterprise hardening is complete.

## Current Assessment
Enterprise hardening is not complete yet.

What is already true:
- Spec/docs/code alignment for v1.2 naming and references is largely landed.
- Canonical `v` key representation is aligned in the main spec table.
- Cross-SDK protocol lookup order was aligned to `_agent._<proto>` -> `_agent.<proto>` -> `_agent.<domain>`.
- Browser fallback trigger was aligned to `ERR_NO_RECORD` and `ERR_DNS_LOOKUP_FAILED`.
- Drift checks in `scripts/docs-check.mjs` were strengthened.

What is still missing:
- Deterministic multi-TXT policy is not fully closed normatively and in parity vectors.
- Exact-host and explicit delegation policy is not fully closed normatively.
- Enterprise security modes are not defined end-to-end.
- Conformance and CI gates are not expanded to the enterprise edge cases.
- Enterprise rollout and ownership docs are not written.
- The live GitHub issue set is behind this plan and needs reconciliation.

## Non-Goals
- No `aid2` wire migration.
- No SRV/HTTPS record transition.
- No protocol rewrite.

## Exit Criteria
- All phases below are complete.
- Spec text and all SDKs are behaviorally aligned.
- CI blocks future drift through conformance and docs checks.
- Enterprise rollout docs exist and are linked from the relevant docs.

## Phase Tracker

### Phase 0. Baseline Alignment
Status: Done

Scope:
- v1.2 naming/reference alignment
- canonical `v` key in spec
- protocol lookup order alignment
- browser fallback trigger alignment
- docs drift checks

Completion evidence:
- baseline alignment work landed before this plan

### Phase 1. Determinism And Discovery Boundaries
Status: Not done

Goal:
- remove discovery ambiguity before adding stricter enterprise policy

Includes:
- deterministic multi-TXT handling
- exact-host lookup default
- explicit delegation model

Exit criteria:
- spec text defines the behavior clearly
- SDKs follow the same behavior
- conformance vectors cover the edge cases

Issue mapping:
- Issue 1
- Issue 2

### Phase 2. Enterprise Security Profile
Status: Not done

Goal:
- define enterprise policy controls without rewriting the base protocol

Includes:
- PKA requirement by mode
- DNSSEC policy levels
- `.well-known` policy by mode
- downgrade memory semantics for `pka` and `kid`

Exit criteria:
- normative spec section exists
- SDK and CLI options map to the policy
- policy failures have defined error semantics

Issue mapping:
- Issue 3

### Phase 3. Canonical Format And Tooling
Status: Partial

Goal:
- standardize canonical wire emission without breaking input compatibility

Includes:
- short-key output policy for v1.x
- long-key input compatibility
- generator and tooling behavior
- warning strategy for long-key emission

Known state:
- some short-key emission work has landed
- policy, linting, and full tooling alignment are still incomplete

Exit criteria:
- spec examples use short-key canonical form
- generators and default writers emit short keys
- tooling warns on long-key output where intended

Issue mapping:
- Issue 4

### Phase 4. Conformance And CI Gates
Status: Not done

Goal:
- prevent reintroduction of cross-SDK drift

Includes:
- shared parity vectors
- CI gates for discovery and security edge cases
- parity diagnostics in `aid-doctor`

Exit criteria:
- shared vectors are consumed across SDKs
- CI fails on divergence
- diagnostics exist for the same edge cases

Issue mapping:
- Issue 5

### Phase 5. Enterprise Rollout Docs
Status: Not done

Goal:
- make enterprise adoption operationally clear

Includes:
- DNS team vs app team ownership model
- rollout sequencing
- TTL and rollback guidance
- delegation patterns
- security mode adoption ladder

Exit criteria:
- rollout playbook exists
- linked from spec/security/tooling docs
- includes apex and subdomain examples

Issue mapping:
- Issue 6

## GitHub Reconciliation

### Existing Live Issues
- `#92` `spec(discovery): exact-host lookup only + explicit delegation model`
- `#93` `spec(security): enterprise profile for PKA + DNSSEC policy levels`
- `#95` `spec(parser): deterministic handling of multiple TXT answers`
- `#96` `spec(format): canonical short-key wire format and long-key compatibility path`
- `#97` `spec(v1.2.x): enterprise hardening tracker (no protocol rewrite)`

### Gaps Against This Plan
- Missing updated tracker issue text for the current phased plan.
- Missing issue for parity vectors + CI gates.
- Missing issue for enterprise rollout playbook.
- Existing tracker `#97` reflects the older pre-phase issue pack.
- Existing security/format issue titles are close, but their wording predates the current plan.

### Recommended Reconciliation Order
1. Update the tracker to match this phased plan.
2. Open the missing parity/CI issue.
3. Open the missing rollout playbook issue.
4. Decide whether to update issue titles/bodies for `#93` and `#96` or leave them as close-enough continuations.

## Execution Order
1. Issue 1: deterministic multi-TXT behavior
2. Issue 2: exact-host discovery and delegation
3. Issue 3: enterprise security profile
4. Issue 4: canonical short-key emission policy
5. Issue 5: conformance and CI gates
6. Issue 6: rollout playbook

## Issue Definitions

### ISSUE 0 (Tracker)

Title:
`spec(v1.2.x): enterprise hardening tracker (post-alignment)`

GitHub issue:
`#97`

Labels:
- `spec`
- `enterprise`
- `tracking`

Body:
```md
## Objective
Track v1.2.x enterprise hardening work after baseline spec/SDK alignment, while preserving the current wire major (`v=aid1`).

## In Scope
- Deterministic multi-TXT behavior.
- Exact-host semantics and explicit delegation.
- Enterprise security profile policy.
- Canonical short-key emission policy.
- Cross-SDK conformance and CI parity gates.
- Rollout guidance for enterprise teams.

## Child Issues
- [ ] #TBD spec(parser): deterministic handling of multiple TXT answers
- [ ] #TBD spec(discovery): exact-host lookup only + explicit delegation model
- [ ] #TBD spec(security): enterprise profile for PKA + DNSSEC + well-known policy
- [ ] #TBD spec(format): canonical short-key emission policy for v1.x
- [ ] #TBD conformance: parity vectors and CI gates for discovery/security edge cases
- [ ] #TBD docs(enterprise): rollout and ownership model (DNS team vs app team)

## Non-Goals
- No `aid2` wire migration.
- No SRV/HTTPS record transition.

## Exit Criteria
- All child issues merged.
- Spec text and all SDKs are behaviorally aligned.
- CI blocks future drift through conformance and docs checks.
```

### ISSUE 1

Title:
`spec(parser): deterministic handling of multiple TXT answers`

GitHub issue:
`#95`

Labels:
- `spec`
- `parser`
- `conformance`

Controversy level: Medium

Body:
```md
## Problem
Resolvers can return multiple TXT answers, and current behavior may depend on answer order. That is risky for enterprise environments.

## Proposal
Define one normative strategy:
1. `single-valid-only` (recommended): exactly one valid AID record is allowed, otherwise fail.
2. `first-valid` (alternative): first valid record wins under strict ordering rules.

## Acceptance Criteria
- Spec normatively defines one strategy.
- All SDK implementations match that strategy.
- Conformance vectors cover:
  - 0 valid answers
  - 1 valid answer
  - 2+ valid answers (ambiguity)
  - malformed + valid mixtures
- `aid-doctor` reports ambiguity with actionable output.

## Open Questions
- Should enterprise profile force `single-valid-only` even if base profile allows `first-valid`?
```

### ISSUE 2

Title:
`spec(discovery): exact-host lookup only + explicit delegation model`

GitHub issue:
`#92`

Labels:
- `spec`
- `discovery`
- `security`

Controversy level: High

Body:
```md
## Problem
Parent fallback/inheritance semantics are underspecified and can cause tenant boundary surprises.

## Proposal
1. Default behavior: query only `_agent.<exact-host-user-entered>`.
2. No implicit parent walking by default.
3. If inheritance is desired, require explicit DNS delegation for that exact host (for example CNAME on `_agent.<child-host>`).

## Example
User enters `app.team.example.com`.
Default query is only `_agent.app.team.example.com`.
If inheritance is desired, operator delegates `_agent.app.team.example.com` explicitly.

## Acceptance Criteria
- Normative spec language for exact-host semantics.
- Examples for direct and delegated setups.
- SDK docs updated to match.
- No SDK performs implicit parent fallback by default.

## Open Questions
- Is DNS delegation alone enough, or is a protocol-level delegate field needed later?
```

### ISSUE 3

Title:
`spec(security): enterprise profile for PKA + DNSSEC + well-known policy`

GitHub issue:
`#93`

Labels:
- `spec`
- `security`
- `enterprise`

Controversy level: High

Body:
```md
## Problem
Base security guidance is not enough for enterprise policy controls, but globally hard-mandating DNSSEC could block adoption.

## Proposal
Define explicit policy modes (for example `balanced`, `strict`) with concrete behavior:
- PKA requirement by mode.
- DNSSEC policy levels: `off | prefer | require`.
- Downgrade memory semantics for `pka`/`kid` changes.
- `.well-known` fallback policy by mode (for example disabled in strict).

## Acceptance Criteria
- New normative spec section for policy modes.
- SDK/CLI options map cleanly to policy controls.
- Error semantics defined for policy failures.
- Conformance tests for each policy mode.

## Open Questions
- Should strict mode be the recommended enterprise default?
- Should mode names be normative or only illustrative?
```

### ISSUE 4

Title:
`spec(format): canonical short-key emission policy for v1.x (long-key input stays compatible)`

GitHub issue:
`#96`

Labels:
- `spec`
- `format`
- `tooling`

Controversy level: Low/Medium

Body:
```md
## Problem
TXT byte budget favors short keys, but canonical output policy is not fully enforced across docs/tooling.

## Proposal
- Canonical v1.x wire emission uses short keys: `v,u,p,a,s,d,e,k,i`.
- Parsers continue accepting long and short keys for v1.x input compatibility.
- Long keys become compatibility-only input, not preferred output.

## Acceptance Criteria
- Spec examples consistently show short-key output.
- Generators/default writers emit short keys.
- Linters/doctor warn on long-key emission.
- No break in parser compatibility for existing long-key records.

## Open Questions
- Keep long-key parsing indefinitely for `aid1`, or define a sunset horizon?
```

### ISSUE 5

Title:
`conformance: parity vectors + CI gates for discovery/security edge cases`

Labels:
- `conformance`
- `sdk-parity`
- `ci`

Controversy level: Medium

Body:
```md
## Problem
Recent alignment fixed major drift, but parity coverage is still not deep enough for enterprise confidence.

## Proposal
Expand shared conformance vectors and CI checks for:
- Multi-TXT determinism.
- Exact-host vs delegated behavior.
- Fallback trigger correctness.
- Security policy mode behavior.
- Deprecation metadata behavior consistency (`dep` warnings/fails by layer).

## Acceptance Criteria
- Shared vectors consumed by all SDKs.
- CI fails on any cross-SDK divergence.
- `aid-doctor` includes parity diagnostics for the same cases.
```

### ISSUE 6

Title:
`docs(enterprise): rollout playbook for DNS teams and application teams`

Labels:
- `docs`
- `enterprise`
- `operations`

Controversy level: Low

Body:
```md
## Problem
Enterprise rollout often fails operationally, not technically. DNS ownership and app ownership are frequently split across teams.

## Proposal
Publish an enterprise rollout playbook with:
- Ownership model (DNS admin vs service owner responsibilities).
- Change window guidance (TTL planning, staged rollout, rollback).
- Delegation patterns for subdomains.
- Security mode adoption ladder (`balanced` -> `strict`).
- Runbook snippets for incident response and downgrade alerts.

## Acceptance Criteria
- New docs page with concrete rollout checklist.
- Linked from spec/security/aid-doctor docs.
- Includes examples for apex and subdomain deployments.
```
