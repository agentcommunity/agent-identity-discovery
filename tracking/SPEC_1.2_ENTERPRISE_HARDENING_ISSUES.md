# SPEC v1.2 Enterprise Hardening Issue Plan

Status: Draft for issue creation
Owner: Agent Community
Branch context: `codex/spec-v1-2-alignment-checks-main`

## Goal
Create a focused, low-drama issue set to harden AID v1.2 for enterprise adoption without rewriting the spec.

This plan uses:
- 1 tracking issue
- 5 focused implementation issues

## Recommended Order
1. Exact-host discovery and explicit delegation model.
2. Enterprise security profile (PKA and DNSSEC policy levels).
3. Cross-SDK deterministic discovery order + parity tests.
4. Deterministic multi-TXT answer behavior.
5. Canonical short-key wire format + long-key compatibility/deprecation path.

## Why This Set
- It resolves the highest-risk ambiguities first.
- It avoids opening 10+ overlapping issues.
- It separates controversial policy from implementation details.

---

## ISSUE 0 (Tracker)

Title:
`spec(v1.2.x): enterprise hardening tracker (no protocol rewrite)`

Body:
```md
## Objective
Track the v1.2.x hardening work needed for reliable enterprise adoption while preserving the existing wire major (`v=aid1`).

## Scope
- Clarify discovery semantics for exact host vs parent domain.
- Define explicit delegation model.
- Define enterprise security profile policy.
- Enforce deterministic cross-SDK behavior.
- Canonicalize short-key wire format policy.

## Child Issues
- [ ] #TBD Exact-host discovery + explicit delegation
- [ ] #TBD Enterprise security profile (PKA required; DNSSEC policy levels)
- [ ] #TBD Cross-SDK deterministic lookup order and parity tests
- [ ] #TBD Deterministic behavior for multiple TXT answers
- [ ] #TBD Canonical short keys and long-key compatibility path

## Non-Goals
- No v2 wire migration in this tracker.
- No SRV/HTTPS record transition in this tracker.

## Exit Criteria
- All child issues merged.
- Spec text and SDK behavior aligned.
- Conformance tests fail on future drift.
```

Suggested labels:
- `spec`
- `enterprise`
- `tracking`

---

## ISSUE 1

Title:
`spec(discovery): exact-host lookup only + explicit delegation model`

Body:
```md
## Problem
Current ecosystem behavior around parent fallback/inheritance is ambiguous. That can cause surprise routing and tenant-boundary risk.

## Proposal
1. Default client behavior: query only `_agent.<exact-host-user-entered>`.
2. No implicit parent walking (`_agent.parent.tld`) by default.
3. If inheritance is desired, require explicit DNS delegation (for example via CNAME on `_agent.<child-host>`).

## Example
If user enters `app.team.example.com`, query only:
- `_agent.app.team.example.com`

If operator wants inheritance, they publish explicit delegation for that exact host.

## Acceptance Criteria
- Normative spec language updated.
- Examples include exact-host and explicit delegation.
- SDK docs updated to match.
- No SDK performs implicit parent fallback unless an explicit opt-in option is added and documented as non-default.

## Open Questions
- Is CNAME-based delegation sufficient, or do we need a dedicated `delegate` key?
- Should implicit parent fallback exist only behind an explicit non-default option?
```

Suggested labels:
- `spec`
- `discovery`
- `security`

Controversy level: High

---

## ISSUE 2

Title:
`spec(security): enterprise profile for PKA + DNSSEC policy levels`

Body:
```md
## Problem
Base-spec security recommendations are not enough for strict enterprise environments, but hard-mandating DNSSEC globally can block adoption.

## Proposal
Define an enterprise profile (policy layer) with:
- PKA required for remote protocols.
- DNSSEC policy levels: `off | prefer | require`.
- Downgrade memory behavior defined (for PKA removal/change).
- `.well-known` disabled by default in strict mode.

## Acceptance Criteria
- New spec section: "Enterprise Security Profile".
- SDK/CLI options documented consistently.
- Error semantics defined for policy failures.
- Conformance tests for each policy level.

## Open Questions
- Should `require` DNSSEC be recommended default for enterprise profile, or only for high-risk deployments?
- Do we need profile names (for example `strict`, `balanced`) mapped to concrete flags?
```

Suggested labels:
- `spec`
- `security`
- `enterprise`

Controversy level: High

---

## ISSUE 3

Title:
`conformance: deterministic lookup order across all SDKs`

Body:
```md
## Problem
Lookup order differs across SDKs today (base vs protocol-specific order; underscore vs non-underscore probing). This weakens interoperability.

## Proposal
Define one normative lookup order and fallback trigger behavior, then enforce it via shared conformance vectors.

## Acceptance Criteria
- Normative algorithm documented once.
- TS/Go/Python/Rust/.NET/Java implement the same order.
- Conformance fixture set includes positive and negative order-sensitive cases.
- CI fails if any SDK diverges.

## Notes
This issue is about behavior parity, not adding new discovery features.
```

Suggested labels:
- `conformance`
- `sdk-parity`
- `spec`

Controversy level: Medium

---

## ISSUE 4

Title:
`spec(parser): deterministic handling of multiple TXT answers`

Body:
```md
## Problem
Resolvers can return multiple TXT answers; current behavior may depend on answer ordering.

## Proposal
Define deterministic handling for multiple TXT answers. Options to decide:
1. First-valid wins (with strict preconditions), or
2. Hard-fail on ambiguity unless exactly one valid AID record exists.

## Acceptance Criteria
- Spec explicitly defines allowed behavior.
- All SDK parsers/discovery implementations match.
- Conformance vectors include multi-answer edge cases.
- aid-doctor reports ambiguity clearly.

## Open Questions
- Which policy is safer for enterprise: "single-valid-only" or "first-valid"?
```

Suggested labels:
- `spec`
- `parser`
- `conformance`

Controversy level: Medium

---

## ISSUE 5

Title:
`spec(format): canonical short-key wire format and long-key compatibility path`

Body:
```md
## Problem
Short keys are better for TXT byte budgets, but spec/docs currently mix canonical and compatibility views.

## Proposal
- Canonical wire output for v1.x uses short keys: `v,u,p,a,s,d,e,k,i`.
- Parsers MAY accept long keys in v1.x for compatibility.
- Long keys are marked compatibility-only (not preferred output).
- Define deprecation messaging/timeline for long-key output.

## Acceptance Criteria
- Spec tables and examples use short keys as canonical.
- Generator defaults to short keys.
- SDK parsers remain backward-compatible for v1.x input.
- Lint/check tooling warns on long-key output (not input).

## Open Questions
- Keep long-key parsing forever in v1.x, or only through a defined sunset window?
```

Suggested labels:
- `spec`
- `format`
- `tooling`

Controversy level: Low/Medium

---

## Discussion Guidance (for review threads)
Use these prompts when sharing with the group:
1. Should exact-host be absolute default with zero parent walking?
2. Is explicit delegation via DNS enough, or do we want a protocol-level delegate field?
3. Should enterprise profile ship as normative spec text or as a separate profile document first?
4. For multi-TXT handling, do we optimize safety (ambiguity fail) or convenience (first-valid)?
5. Do we keep long-key parsing indefinitely for `aid1`, while standardizing short-key emission now?

## Practical Recommendation
If time is tight, implement in this order:
1. Issue 3 (parity) and Issue 4 (multi-TXT determinism) together.
2. Issue 1 (exact-host + delegation).
3. Issue 2 (enterprise security profile).
4. Issue 5 (short-key canonicalization).

This reduces implementation thrash because behavior determinism lands before policy hardening.
