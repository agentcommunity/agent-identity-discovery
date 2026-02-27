# SPEC v1.2 Enterprise Hardening Plan

Status: Complete
Owner: Agent Community
Updated: 2026-02-27
Branch context: `codex/spec12-enterprise-cleanup`
Baseline PR: #90 (spec/docs/sdk alignment)

## Purpose
Track enterprise hardening work for AID v1.2.x after baseline alignment.

This file is the planning source of truth for:
- what already landed
- what still blocks enterprise readiness
- which GitHub issues exist already
- which GitHub issues still need to be opened or updated

## Current Assessment
Enterprise hardening is complete for the v1.2.x scope defined in this plan.

What is already true:
- Spec/docs/code alignment for v1.2 naming and references is largely landed.
- Canonical `v` key representation is aligned in the main spec table.
- Cross-SDK protocol lookup order was aligned to `_agent._<proto>` -> `_agent.<proto>` -> `_agent.<domain>`.
- Browser fallback trigger was aligned to `ERR_NO_RECORD` and `ERR_DNS_LOOKUP_FAILED`.
- Drift checks in `scripts/docs-check.mjs` were strengthened.
- Deterministic multi-TXT behavior is implemented and tested (`#104`).
- Exact-host lookup and explicit delegation semantics are implemented and documented (`#105`).
- Enterprise security presets and policy controls are implemented in the reference stack (`#106`).
- Conformance vectors and CI gates cover the enterprise edge cases in scope (`#107`).
- Enterprise rollout guidance is published and linked from spec/security/tooling docs (`#108`).
- Canonical short-key emission is enforced by default writers, with compatibility warnings for long-key publication (`#109`).

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
Status: Done

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

Completion evidence:
- `#104` deterministic multi-TXT behavior
- `#105` exact-host lookup and delegation semantics

Issue mapping:
- Issue 1
- Issue 2

### Phase 2. Enterprise Security Profile
Status: Done

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

Completion evidence:
- `#106` enterprise security profile

Issue mapping:
- Issue 3

### Phase 3. Canonical Format And Tooling
Status: Done

Goal:
- standardize canonical wire emission without breaking input compatibility

Includes:
- short-key output policy for v1.x
- long-key input compatibility
- generator and tooling behavior
- warning strategy for long-key emission

Exit criteria:
- spec examples use short-key canonical form
- generators and default writers emit short keys
- tooling warns on long-key output where intended

Completion evidence:
- `#109` canonical short-key emission and tooling warnings

Issue mapping:
- Issue 4

### Phase 4. Conformance And CI Gates
Status: Done

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

Completion evidence:
- `#107` conformance vectors and CI gates

Issue mapping:
- Issue 5

### Phase 5. Enterprise Rollout Docs
Status: Done

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

Completion evidence:
- `#108` enterprise rollout playbook

Issue mapping:
- Issue 6

## GitHub Reconciliation

### Existing Live Issues
- `#92` `spec(discovery): exact-host lookup only + explicit delegation model`
- `#93` `spec(security): enterprise profile for PKA + DNSSEC policy levels`
- `#95` `spec(parser): deterministic handling of multiple TXT answers`
- `#96` `spec(format): canonical short-key wire format and long-key compatibility path`
- `#97` `spec(v1.2.x): enterprise hardening tracker (no protocol rewrite)`

### Final Live Issue Set
- `#92` closed by `#105`
- `#93` closed by `#106`
- `#95` closed by `#104`
- `#96` closed by `#109`
- `#97` close when this tracker cleanup lands
- `#101` closed by `#107`
- `#102` closed by `#108`
- `#94` close as superseded by `#105` and `#107`

## Execution Order
Completed:
1. Issue 1: deterministic multi-TXT behavior (`#104`)
2. Issue 2: exact-host discovery and delegation (`#105`)
3. Issue 3: enterprise security profile (`#106`)
4. Issue 4: canonical short-key emission policy (`#109`)
5. Issue 5: conformance and CI gates (`#107`)
6. Issue 6: rollout playbook (`#108`)

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
- [x] #95 spec(parser): deterministic handling of multiple TXT answers
- [x] #92 spec(discovery): exact-host lookup only + explicit delegation model
- [x] #93 spec(security): enterprise profile for PKA + DNSSEC + well-known policy
- [x] #96 spec(format): canonical short-key emission policy for v1.x
- [x] #101 conformance: parity vectors and CI gates for discovery/security edge cases
- [x] #102 docs(enterprise): rollout and ownership model (DNS team vs app team)

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
