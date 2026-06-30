# PKA Domain-Binding: One-Tag Simplification

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Remove the redundant `aid-pka-v2-db` tag. Use a **single tag `aid-pka-v2`** for both unbound and domain-bound PKA proofs; a proof is domain-bound iff the (signed) covered set includes `"aid-domain";req`. Mirrors Web Bot Auth (fixed `tag`, optional component distinguished by coverage) and RFC 9421 §2.3 (`tag` = profile identity, not component enumeration). Equally secure (the covered set is in the signed `@signature-params`), simpler (no tag/coverage reconciliation rules, no validation-order reorder dependency), and composable for future bindings.

**Decided by:** a 3-way panel (steelman-keep, steelman-drop, RFC/WBA precedent) — unanimous "drop", high confidence, zero security difference. This changes the open PR #145.

**Scope:** spec + vectors + all 6 SDKs (TS reference + Go/Py/Rust/.NET/Java) + web demo + e2e + docs. Mostly deletion + a vector re-sign + test-semantics rework.

---

## The new contract (what changes)

| Aspect | Two-tag (current) | One-tag (new) |
| --- | --- | --- |
| Tag | `aid-pka-v2` (unbound) / `aid-pka-v2-db` (bound) | **`aid-pka-v2` always** |
| Bound signal | the tag | **`aid-domain` present in the signed covered set** |
| `validateV2CoveredSet` | tag-keyed: exactly 4 (v2) or exactly 5 (db) | tag-independent: accept **exactly the 4 base** OR **the 4 base + `aid-domain;req`** (between `@authority` and `@status`); reject any other shape; **return `domainBound` = (aid-domain present)** |
| Validation-order reorder | required (tag needed before validation) | **no longer needed** (validation doesn't read the tag) — may simplify back or leave harmless |
| Tag check | accept either tag | accept **only `aid-pka-v2`** |
| Reject: db-without-coverage | MUST | gone (can't happen — no tag to disagree) |
| Reject: v2-with-coverage | MUST | gone |
| Reject: aid-domain covered but client sent no domain | "Unrequested domain-bound signature tag" | keep — "response covers aid-domain but no AID-Domain was sent" (now keyed on coverage, the existing fail-closed gate is primary) |
| `domainBound` | `tag == db` | `covered set includes aid-domain` |
| Accept-Signature (client request binding) | covered has aid-domain + `tag=aid-pka-v2-db` | covered has aid-domain + `tag=aid-pka-v2` + AID-Domain header |

Backward-compat: an unbound `aid-pka-v2` proof is byte-identical to today. The only wire change is the bound proof's tag (`-db` → plain).

---

## The two new vectors (COMPUTED + VERIFIED — use verbatim)

Both use the deterministic seed `AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=`, key `ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ`, thumbprint `WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk`, nonce `oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8`, created `1767139200`, expires `1767139260`, status `401`, target `https://api.example.com/mcp?check=1`, authority `api.example.com`.

Shared `signature_input` for BOTH (tag now `aid-pka-v2`):
```
aid-pka=("@method";req "@target-uri";req "@authority";req "aid-domain";req "@status");created=1767139200;expires=1767139260;keyid="WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk";alg="ed25519";nonce="oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8";tag="aid-pka-v2"
```

**PASS vector `v2-db-rfc9421-domain-bound`** (keep id; bound proof): `request.aid_domain="example.com"`, covered includes aid-domain, tag now `aid-pka-v2`.
- `signature_base` (verify against this):
```
"@method";req: GET\n"@target-uri";req: https://api.example.com/mcp?check=1\n"@authority";req: api.example.com\n"aid-domain";req: example.com\n"@status": 401\n"@signature-params": ("@method";req "@target-uri";req "@authority";req "aid-domain";req "@status");created=1767139200;expires=1767139260;keyid="WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk";alg="ed25519";nonce="oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8";tag="aid-pka-v2"
```
- `response.signature`: `aid-pka=:seQc2V62hRwtLkVU2WhqjJJ/F+4uEjTgsUGS2veacVJT0maYV+lksSkdxK+JLMqHP2iTvPkzfdEMeXhCWI6WCQ==:`
- `expect: pass`.

**FAIL vector — rename `v2-db-missing-aid-domain-coverage` → `v2-db-domain-mismatch`** (covers aid-domain, signed over a DIFFERENT domain → forgery-resistance test): `request.aid_domain="example.com"`, covered includes aid-domain, tag `aid-pka-v2`, but the signature was computed over a base whose `aid-domain` line is `evil.example`. The verifier rebuilds with `example.com` (from request.aid_domain) → Ed25519 verify fails → reject.
- `signature_base` (what the verifier builds — same as PASS, example.com).
- `response.signature_input`: same as PASS.
- `response.signature`: `aid-pka=:AavGXhhOm8c4fqrWcC+UPs86nAqDTQSLcofa3Vb4S1Hr9CU7C3eR5T8v137XyWStHrh17gyZ41B96vA8vqpABw==:`
- `expect: fail`. Add a `desc` explaining it's a cross-domain mismatch.
- Verified: this signature does NOT verify against the example.com base.

(Re-verify after editing: `node -e` sign/verify against the seed — pass must verify true, mismatch false.)

---

## Phase order (TS reference first; mirror; then docs/web/e2e; then verify)

### Task T1 — TS reference (`packages/aid/src/pka.ts`) + vectors + TS tests
- Remove `AID_PKA_TAG_V2_DB` const. Keep `AID_PKA_TAG_V2 = 'aid-pka-v2'`.
- `buildAcceptSignatureV2(keyid, nonce, domainBound)`: tag ALWAYS `aid-pka-v2`; covered = 5 (with `"aid-domain";req`) iff domainBound, else 4. (Only the covered list varies.)
- `validateV2CoveredSet(covered)`: drop the `domainBound` param. Accept exactly the 4 base components, OR the 4 base + `aid-domain;req` (position-correct, no dupes, no extras). **Return** `domainBound` (whether aid-domain present). Reject other shapes. (Remove the reorder dependency — the call no longer needs the tag; place it wherever cleanest.)
- `parseV2SignatureHeaders` / `performV2PKAHandshake`: tag check accepts only `aid-pka-v2`; `domainBound` comes from `validateV2CoveredSet`'s return (coverage), not the tag. Keep the gate "aid-domain covered but no domain sent → reject" (now the primary protection; reword message to e.g. "Response covers aid-domain but no AID-Domain was sent"). Build the base with the aid-domain line iff covered.
- Update `protocol/pka_vectors.json`: the two vectors per the COMPUTED values above (re-sign pass; rename + mismatch-sign the fail). Re-verify with node.
- Rework `packages/aid/src/pka.v2db.test.ts` semantics:
  - "verifies the canonical domain-bound vector and reports domainBound" → keep (re-signed vector, tag aid-pka-v2).
  - "accepts a plain v2 response to a domain-bound request and reports domainBound=false" → keep (4-component response, domainBound false).
  - "rejects a db-tagged response that does not cover aid-domain" → REMOVE/REPLACE (premise gone). Replace with "rejects a response with an invalid covered set" (e.g. aid-domain + an extra disallowed component) if useful.
  - "rejects an unrequested domain-bound response" (was: db tag, no domain) → change to "rejects a response that covers aid-domain when no AID-Domain was sent".
  - "rejects when the signed domain differs from the sent domain" → keep (this is now the mismatch path; can drive off the new `v2-db-domain-mismatch` vector).
  - the hardening test "rejects a plain aid-pka-v2 response that covers aid-domain" → REMOVE (under one tag, aid-pka-v2 + aid-domain IS the valid bound proof).
  - "canonicalizes AID-Domain values" → keep.
  - Also check `pka.v2.test.ts` for any `aid-pka-v2-db` string assertions and update.
- Run `pnpm -C packages/aid test` green; commit `refactor(aid): single aid-pka-v2 tag; domain-bound signaled by aid-domain coverage`.

### Task T2 — spec + docs
- `packages/docs/specification.md` B.7: replace the two-tag mechanic with one tag; restate verifier rules (domainBound ⟺ aid-domain covered; client w/o AID-Domain rejects an aid-domain-covering response; covered set must be base-4 or base-4+aid-domain). B.6 item 3: drop the dual-tag wording → single tag + optional aid-domain component. §3.3 `require` semantics unchanged in meaning. versioning.md: update the `aid-pka-v2-db` mention.
- Sweep ALL `aid-pka-v2-db` references across `packages/docs/**`, READMEs, quickstarts (grep `aid-pka-v2-db`), the demo/e2e prose.
- `pnpm docs:export && pnpm docs:verify` exit 0; commit the manifest.

### Task T3 — the 5 non-TS SDKs (mirror the TS diff)
Per SDK (Go/Py/Rust/.NET/Java): remove the `-db` tag constant; `buildAcceptSignatureV2` always emits `aid-pka-v2`; `validateV2CoveredSet` accepts 4-or-5 (no tag param) and yields `domainBound` from aid-domain presence; tag check single `aid-pka-v2`; `domainBound` from coverage; keep the "aid-domain covered but no domain sent" reject; the validation-order reorder may be simplified back (optional). Update the two vector tests (the fail vector id is now `v2-db-domain-mismatch`; it now fails at Ed25519 verify, not covered-set validation — the test still asserts an error). Verify each SDK's suite. (Go reference diff for T1 is the template.)

### Task T4 — web demo + e2e
- `packages/web/src/app/api/pka-demo/route.ts`: when bound, sign `tag="aid-pka-v2"` with the aid-domain covered line (remove `aid-pka-v2-db` / `V2_COVERED_DB` tag usage — keep the 5-component covered set but the tag is now plain). Update the route test.
- `packages/e2e-tests/src/pka_e2e.ts`: the domain-bound mock signs `aid-pka-v2`.

### Task T5 — full verification + push
- `pnpm build && pnpm test && pnpm lint && pnpm test:parity`; per-SDK suites (Rust/Java; .NET via `DOTNET_ROLL_FORWARD=Major` if net9 absent). Changeset note. Commit; push (updates PR #145).

---

## Self-review
- Vectors computed + verified (pass true, mismatch false). ✅
- Security unchanged (covered set signed either way); contract table covers every rule delta. ✅
- Test-semantics rework enumerated (several TS tests invert/disappear under one tag — handled in T1). ✅
- Single source of truth (covered set); no tag/coverage reconciliation; reorder dependency removed. ✅
