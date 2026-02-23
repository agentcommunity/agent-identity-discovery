# SPEC v1.2 Enterprise Hardening Issue Pack

Status: Ready for issue creation
Owner: Agent Community
Updated: 2026-02-23
Branch context: `codex/spec-core-align-fixes`
Baseline PR: #90 (spec/docs/sdk alignment)

## Current Snapshot
The baseline alignment work is done. Enterprise hardening now needs focused policy decisions and conformance expansion, not a rewrite.

## Already Landed (Do Not Reopen)
- Spec/docs/code alignment for v1.2 naming and references.
- Canonical `v` key representation in spec key table.
- Cross-SDK protocol lookup order aligned to `_agent._<proto>` -> `_agent.<proto>` -> `_agent.<domain>`.
- Browser fallback trigger aligned to `ERR_NO_RECORD` and `ERR_DNS_LOOKUP_FAILED`.
- Drift checks strengthened in `scripts/docs-check.mjs`.

## Outstanding Work (Open These Issues)
- 1 tracker issue
- 6 focused implementation/policy issues

## Recommended Execution Order
1. Deterministic multi-TXT behavior.
2. Exact-host discovery and explicit delegation.
3. Enterprise security profile (PKA/DNSSEC/well-known policy).
4. Short-key canonical emission policy and tooling.
5. Conformance expansion and CI parity gates.
6. Operational rollout profile docs and migration guidance.

---

## ISSUE 0 (Tracker)

Title:
`spec(v1.2.x): enterprise hardening tracker (post-alignment)`

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

---

## ISSUE 1

Title:
`spec(parser): deterministic handling of multiple TXT answers`

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

---

## ISSUE 2

Title:
`spec(discovery): exact-host lookup only + explicit delegation model`

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

---

## ISSUE 3

Title:
`spec(security): enterprise profile for PKA + DNSSEC + well-known policy`

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

---

## ISSUE 4

Title:
`spec(format): canonical short-key emission policy for v1.x (long-key input stays compatible)`

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

---

## ISSUE 5

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

---

## ISSUE 6

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

---

## Practical Recommendation
If you want minimal issue churn tonight, open exactly these 7 issues (tracker + 6), in the order above. That is enough for enterprise readiness planning without over-fragmentation.
