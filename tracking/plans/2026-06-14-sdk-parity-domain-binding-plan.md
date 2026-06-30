# Non-TS SDK Parity — Domain Binding Implementation Plan

> **SUPERSEDED:** This plan preserves the pre-simplification SDK rollout for history only. The active contract is the one-tag model in `2026-06-14-one-tag-simplification-plan.md`: `tag="aid-pka-v2"` is used for both bound and unbound proofs, and domain binding is indicated by signed coverage of `"aid-domain";req`. Rust now also surfaces `domain_bound` through discovery result APIs rather than remaining verification-only.

> **DO NOT IMPLEMENT THIS PLAN.** The agent instructions and task checkboxes below are historical notes for reconstructing the old two-tag rollout, not current work guidance.

> **Historical agent instructions:** This superseded plan originally required superpowers:subagent-driven-development or superpowers:executing-plans and checkbox tracking. Keep this text only as archive context.

**Goal:** Bring the five non-TypeScript SDKs (Go, Python, Rust, .NET, Java) to parity with the TS SDK's PKA domain-binding profile — they currently behave as non-supporting clients (never send `AID-Domain`, never verify `aid-pka-v2-db`). After this, all six SDKs send `AID-Domain` by default for v2 PKA, verify the `aid-pka-v2-db` tag + `"aid-domain";req` covered component, and surface a `domainBound` boolean.

**Architecture:** Each SDK already has a complete v2 PKA verifier. The change is the SAME transformation in each language (the "Recipe" below), grounded per-SDK against current code. Go is the reference (cleanest test harness, no async, shared-vector tests) — do it first; the others mirror its committed diff with language-specific deltas. The shared vectors `v2-db-rfc9421-domain-bound` (pass) and `v2-db-missing-aid-domain-coverage` (fail) already exist in `protocol/pka_vectors.json`. No new vectors, no spec change, no TS change.

**Tech Stack:** Go (stdlib), Python (stdlib + cryptography/PyNaCl), Rust (reqwest/tokio, `handshake` feature), .NET (NSec), Java (JDK HttpClient), plus a docs sweep + changesets.

**Scope check / phasing:** This is 5 independent subsystems. They share one contract but compile/test independently, so this is one plan with one phase per SDK (each phase produces a working, tested SDK on its own) plus a final docs+release phase. Recommended order (easiest→hardest): **Go → Python → Rust → .NET → Java**. Each phase is independently shippable; you may stop after any phase.

**Validation:** Stress-tested by two independent clean-context reviewers (contract-correctness/cross-SDK-consistency + executability-vs-real-code). Reviewer 1 empirically verified the domain-bound vector signature and confirmed the canonicalization-parity risk is neutralized (every SDK canonicalizes inside the handshake, so header and rebuilt sig-base always match). Revised to fix every Critical/Important finding: three missed compile/test breaks (Rust `well_known.rs:84/86`, .NET `DiscoveryV2Tests.cs` reflection helper, Java's `gradlew` lives at repo root as `:aid-java`), the Go `resolve`-closure boundary, the Java `discover → parseSingleValid → selectValidRecord` chain, the canonicalize-once + strip-exactly-one-dot + anchored-charset parity rules, and the Rust verification-only-surfacing decision (documented in the changeset). One reviewer claim — "spec has no Appendix B.7" — was a false positive (it read the main checkout on a different branch; our branch's spec has B.7).

---

## The Shared Recipe (every SDK does these 8 things)

1. **Covered whitelist:** allow `"aid-domain"` as a covered-component name (alongside `@method`/`@target-uri`/`@authority`/`@status`).
2. **Tag-aware covered-set validation — parse the tag BEFORE validating coverage.** All five SDKs currently validate the covered set (expecting exactly 4 items) _before_ the tag is known. Reorder so the tag is parsed first, then validate: `aid-pka-v2` → exactly 4 components; `aid-pka-v2-db` → exactly 5 incl `"aid-domain";req`. A db-tagged response missing `aid-domain` MUST be rejected (the fail vector).
3. **Build accept-signature:** when a domain is provided, emit the 5-component covered list (`"aid-domain";req` between `@authority` and `@status`) with tag `aid-pka-v2-db`; else the existing 4-component / `aid-pka-v2` form.
4. **Signature base:** add an `"aid-domain";req: <domain>` line (between `@authority` and `@status`); thread `domain` through the sig-base context. Fail-closed if a covered item is `aid-domain` but no domain was sent.
5. **Handshake:** accept a `domain` parameter; when non-empty, **canonicalize** it (ASCII-lowercase, strip one trailing dot, validate charset `[a-z0-9.:[\]_-]`) and set the `AID-Domain` request header; reject a `aid-pka-v2-db` response when no domain was sent ("Unrequested domain-bound signature tag"); accept either tag; return `domainBound` (true only for `aid-pka-v2-db`).
6. **Discovery:** pass the queried A-label host (already computed for the DNS query) as the domain; v1 path passes no domain and returns `domainBound=false`.
7. **Surface `domainBound`** on the discovery result (shape varies per SDK — see each phase).
8. **Tests:** add the two shared vectors as a pass test (`domainBound==true`, `AID-Domain` header sent) and a fail test (db tag without `aid-domain` coverage → ERR_SECURITY).

**Canonicalization parity:** mirror TS `canonicalizeAidDomain` (`packages/aid/src/pka.ts:98-105`): trim → ASCII-lowercase → strip one trailing `.` → reject empty or chars outside `[a-z0-9.:[\]_-]`. Use each SDK's existing constant-time lowercase helper where present, not the locale-aware one. **Two parity pitfalls (the shared `example.com` vector won't catch either — get them right per SDK):** (a) strip **exactly one** trailing dot (TS slices one — `example.com..` → `example.com.`); do NOT use rstrip-all / `trim_end_matches('.')`. (b) the charset check must be **anchored/full-match** (TS uses `^...+$`); Python MUST use `re.fullmatch` (not `re.match`/`search`), Java `matches(...)` (which is implicitly anchored), Rust `chars().all(...)`, Go a full-string loop, .NET `Regex.IsMatch` with `^...$`.

**Canonicalize once, thread the SAME value to both the header and the signature base.** This is the load-bearing correctness rule (the verifier rebuilds the `aid-domain` sig-base line from its own canonical domain). In each SDK's handshake, compute `canonical = canonicalize(domain)` ONCE, then use `canonical` for BOTH the `AID-Domain` request header AND the value passed into the signature-base builder. Never send `canonical` in the header but pass the raw `domain` to the base (verification would fail for any not-already-canonical host).

**Backward-compat invariant (all SDKs):** when no domain is passed, behavior is byte-identical to today (4 components, tag `aid-pka-v2`, no `AID-Domain` header). Existing vector tests stay green.

---

# PHASE 1 — Go (`packages/aid-go`) — REFERENCE SDK

> Effort: M (~120-180 lines). Result surfacing: introduce `DiscoveryResult` for `DiscoverWithOptions`; keep `Discover()` backward-compatible. Verify: `cd packages/aid-go && go test ./... -count=1`.

### Task G1: add the `aid-domain` covered component + tag-aware validation (parse order fix)

**Files:** Modify `packages/aid-go/pka.go`; Test `packages/aid-go/pka_v2_test.go`

- [ ] **Step 1: Write a failing unit test** for tag-aware validation — add to `pka_v2_test.go` a test that a `aid-pka-v2-db` Signature-Input covering only 4 components is rejected (mirror the existing covered-set rejection tests; build the header with `tag="aid-pka-v2-db"` and 4 covered items, expect `parseV2SignatureHeaders` → `ERR_SECURITY`).
- [ ] **Step 2: Run it — expect FAIL** (`aid-domain` not whitelisted / validation not tag-aware): `cd packages/aid-go && go test ./... -run TestPKAV2 -count=1`
- [ ] **Step 3: Whitelist `aid-domain`** in `parseV2CoveredItem` (pka.go:572-576): add `"aid-domain"` to the `switch name` case.
- [ ] **Step 4: Make `validateV2CoveredSet` tag-aware** (pka.go:580):

```go
func validateV2CoveredSet(covered []v2CoveredItem, isDomainBound bool) error {
    expected := map[string]bool{"@method": true, "@target-uri": true, "@authority": true, "@status": false}
    if isDomainBound {
        expected["aid-domain"] = true
    }
    if len(covered) != len(expected) {
        return newAidError("ERR_SECURITY", "Signature-Input must cover required fields")
    }
    seen := map[string]bool{}
    for _, item := range covered {
        req, ok := expected[item.name]
        if !ok || seen[item.name] || req != item.req {
            return newAidError("ERR_SECURITY", "Signature-Input must cover required fields")
        }
        seen[item.name] = true
    }
    if len(seen) != len(expected) {
        return newAidError("ERR_SECURITY", "Signature-Input must cover required fields")
    }
    return nil
}
```

- [ ] **Step 5: Reorder `parseV2SignatureHeaders`** (pka.go ~360-387): remove the early `validateV2CoveredSet(covered)` call (it's at **line 371**); after the params block extracts `tag`, call `validateV2CoveredSet(covered, parsed.tag == "aid-pka-v2-db")`. (The tag local is the value compared at the existing tag check.)
- [ ] **Step 6: Run — expect PASS** for the new test; **Step 7: Commit** `feat(aid-go): tag-aware v2 covered-set validation for domain binding`.

### Task G2: thread the domain through the handshake + sign the aid-domain line

**Files:** Modify `packages/aid-go/pka.go`; Test `packages/aid-go/pka_v2_test.go`

- [ ] **Step 1: Add the pass-vector test** (the real end-to-end): add a `Domain` field to the `pkaV2Vector` struct + `AidDomain` to its `Request`, then:

```go
func TestPKAV2DomainBoundPassVector(t *testing.T) {
    vector := loadPKAV2Vector(t, "v2-db-rfc9421-domain-bound")
    withPKAV2VectorClockAndNonce(t, vector)
    oldClient := httpClient
    httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
        if req.Header.Get("AID-Domain") != vector.Request.AidDomain {
            t.Fatalf("expected AID-Domain %q got %q", vector.Request.AidDomain, req.Header.Get("AID-Domain"))
        }
        h := http.Header{}
        h.Set("Cache-Control", vector.Response.CacheControl)
        h.Set("Signature-Input", vector.Response.SignatureInput)
        h.Set("Signature", vector.Response.Signature)
        return &http.Response{StatusCode: vector.Response.Status, Header: h, Body: io.NopCloser(strings.NewReader(""))}, nil
    })}
    t.Cleanup(func() { httpClient = oldClient })
    result, err := performPKAHandshake(vector.Record.U, vector.Record.K, "", vector.Domain, time.Second)
    if err != nil { t.Fatalf("unexpected error: %v", err) }
    if !result.DomainBound { t.Fatalf("expected DomainBound=true") }
}
```

- [ ] **Step 2: Run — expect FAIL** (signature `performPKAHandshake` doesn't take a domain / no result struct).
- [ ] **Step 3: Add the result struct + canonicalizer** in pka.go:

```go
type PKAHandshakeResult struct{ DomainBound bool }

func canonicalizeAidDomain(domain string) (string, error) {
    value := asciiToLower(strings.TrimSpace(domain))
    value = strings.TrimSuffix(value, ".")
    if value == "" { return "", newAidError("ERR_SECURITY", "Invalid AID-Domain value") }
    for _, c := range value {
        if !((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '.' || c == ':' || c == '[' || c == ']' || c == '_' || c == '-') {
            return "", newAidError("ERR_SECURITY", "Invalid AID-Domain value")
        }
    }
    return value, nil
}
```

- [ ] **Step 4: `v2SignatureContext` gains `domain string`** (pka.go:329); **`buildV2SignatureBase`** adds, between `@authority` and `@status`:

```go
case "aid-domain":
    if ctx.domain == "" { return nil, newAidError("ERR_SECURITY", "Signature covers aid-domain but no AID-Domain was sent") }
    lines = append(lines, `"aid-domain";req: `+ctx.domain)
```

- [ ] **Step 5: `buildAcceptSignatureV2(keyID, nonce, domain string)`** (pka.go:287) — when `domain != ""`, 5 components + tag `aid-pka-v2-db`; else the existing string.
- [ ] **Step 6: `performV2PKAHandshake(uri, pka, domain string, timeout) (PKAHandshakeResult, error)`** (pka.go:144): canonicalize domain (if non-empty); pass to `buildAcceptSignatureV2`; set `AID-Domain` header when non-empty; replace the tag check with `isDomainBound := timingSafeEqualString(parsed.tag, "aid-pka-v2-db")` / reject neither-tag / reject `isDomainBound && canonicalDomain == ""`; thread `domain: canonicalDomain` into the sig-base context; return `PKAHandshakeResult{DomainBound: isDomainBound}`. All error returns become `(PKAHandshakeResult{}, err)`.
- [ ] **Step 7: `performPKAHandshake(uri, pka, kid, domain string, timeout) (PKAHandshakeResult, error)`** (pka.go:39): v2 path delegates; v1 path returns `PKAHandshakeResult{DomainBound:false}` after success.
- [ ] **Step 8: Update existing `pka_v2_test.go` call sites** — add `""` domain arg + capture `_, err`. The `validPKAV2SignatureHeaders()` helper stays (4-component/`aid-pka-v2`).
- [ ] **Step 9: Run — expect PASS**; **Step 10: Commit** `feat(aid-go): send AID-Domain and verify domain-bound PKA responses`.

### Task G3: add the fail vector + wire discovery + surface DomainBound

**Files:** Modify `packages/aid-go/discover.go`, `packages/aid-go/discover_test.go`; Test `packages/aid-go/pka_v2_test.go`

- [ ] **Step 1: Add the fail-vector test** — `TestPKAV2DomainBoundMissingCoverageRejected` loads `v2-db-missing-aid-domain-coverage`, mocks the response, and expects `performPKAHandshake(..., vector.Domain, ...)` → `ERR_SECURITY` (db tag, 4 covered items → validateV2CoveredSet fails).
- [ ] **Step 2: Run — expect FAIL** until discovery wiring compiles (the result-struct change ripples).
- [ ] **Step 3: Add `DiscoveryResult`** to discover.go (`Record AidRecord; TTL uint32; DomainBound bool`); change `DiscoverWithOptions` to return `(DiscoveryResult, error)`; at the two `performPKAHandshake` call sites (lines 88, 133) pass `alabel` (passing raw `alabel` is fine — the handshake's `canonicalizeAidDomain` lowercases anyway; `asciiToLower(alabel)` is harmless belt-and-suspenders) and put `pkaResult.DomainBound` on the result. Non-PKA returns set `DomainBound:false`. **Note the closure boundary:** the PKA call at line 88 lives inside the nested `resolve` closure (defined ~line 50) which currently returns `(AidRecord, uint32, error)`; you must rework `resolve` to return `(DiscoveryResult, error)` (or capture `DomainBound` out of it) — this is the one non-mechanical edit in Phase 1. The closure is invoked ~line 109.
- [ ] **Step 4: Keep `Discover()` backward-compatible**: `func Discover(domain string, timeout time.Duration) (AidRecord, uint32, error)` wraps `DiscoverWithOptions` and returns `res.Record, res.TTL, err`.
- [ ] **Step 5: Mechanical sweep of `discover_test.go`** — `res, err := DiscoverWithOptions(...)` with `res.Record`.
- [ ] **Step 6: Run full Go suite — expect PASS**: `cd packages/aid-go && go test ./... -count=1`; **Step 7: Commit** `feat(aid-go): thread queried domain through discovery, expose DomainBound`.

---

# PHASE 2 — Python (`packages/aid-py`)

> Effort: M (~100-120 lines). Result surfacing: inject `record["domain_bound"]` into the returned record dict (least-breaking; mirrors how `pka` is an optional key). Header: build the `headers=` dict at `Request(...)` construction — NEVER `add_header("AID-Domain", ...)` (it mangles case to `Aid-domain`). Verify: `cd packages/aid-py && python3 -m pytest tests/test_pka_vectors.py -v`.

### Task P1: covered whitelist + tag-aware validation + parse-order fix

**Files:** Modify `packages/aid-py/aid_py/pka.py`; Test `packages/aid-py/tests/test_pka_vectors.py`

- [ ] **Step 1: Write the failing fail-vector test** `test_v2_pka_rejects_db_signature_missing_aid_domain_coverage` (loads `v2-db-missing-aid-domain-coverage`, monkeypatches DNS-miss + nonce + time, mocks the response, expects `discover(...)` → `AidError` with `error_code == "ERR_SECURITY"`). Mirror the existing v2 named-vector tests' monkeypatch harness.
- [ ] **Step 2: Run — expect FAIL**: `python3 -m pytest tests/test_pka_vectors.py -k "missing_aid_domain" -v`
- [ ] **Step 3: Whitelist** — `_parse_v2_covered_item` (pka.py:461): add `"aid-domain"` to the `_token_in(name, (...))` tuple.
- [ ] **Step 4: Tag-aware `_validate_v2_covered_set`** (pka.py:474): add `*, is_domain_bound: bool = False`; when true, `expected["aid-domain"] = True` (length becomes 5). The order-insensitive loop self-adjusts.
- [ ] **Step 5: Reorder `_parse_v2_signature_headers`** (pka.py:521): move the `_validate_v2_covered_set(covered)` call to after `tag = params["tag"]` is extracted; call `_validate_v2_covered_set(covered, is_domain_bound=_token_eq(tag, "aid-pka-v2-db"))`.
- [ ] **Step 6: Run — expect the fail-vector test to PASS** (the db-without-coverage rejection fires in validation). **Step 7: Commit** `feat(aid-py): tag-aware v2 covered-set validation for domain binding`.

### Task P2: handshake sends AID-Domain, signs aid-domain, returns domain_bound

**Files:** Modify `packages/aid-py/aid_py/pka.py`; Test `packages/aid-py/tests/test_pka_vectors.py`

- [ ] **Step 1: Write the pass-vector test** `test_v2_pka_accepts_domain_bound_signature` (loads `v2-db-rfc9421-domain-bound`; asserts the request's `AID-Domain` header equals `vector["request"]["aid_domain"]`; asserts `rec.get("domain_bound") is True`).
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Add `_canonicalize_aid_domain`** (near pka.py:573) using `_ascii_lower_ct` (NOT `.lower()`), strip trailing dot, regex `r"[a-z0-9.:[\]_-]+"`, raise `ERR_SECURITY` "Invalid AID-Domain value" on empty/bad.
- [ ] **Step 4: `_build_v2_signature_base`** (pka.py:591): add `aid_domain: str | None = None`; in the loop, after `@authority`, add the `_token_eq(name, "aid-domain")` branch appending `f'"aid-domain"{suffix}: {aid_domain}'` (raise if `aid_domain is None`).
- [ ] **Step 5: `_build_accept_signature_v2(keyid, nonce, domain_bound=False)`** (pka.py:628): branch covered list + tag (verify byte-equality against the vector's `accept_signature`).
- [ ] **Step 6: `_perform_v2_pka_handshake(uri, pka, *, domain=None, timeout=2.0) -> bool`** (pka.py:701): canonicalize domain; build a `req_headers` dict (Accept-Signature with `domain_bound=canonical_domain is not None`, Cache-Control, and `AID-Domain` when set) and pass it to `urllib.request.Request(..., headers=req_headers, ...)`; replace the tag check with the dual-tag + `is_db and canonical_domain is None` reject; pass `aid_domain=canonical_domain` to the sig base; `return is_db`.
- [ ] **Step 7: `perform_pka_handshake(..., *, domain=None, ...) -> bool`** (pka.py:773): v1 returns `False`; v2 returns the handshake's bool.
- [ ] **Step 8: Run pass-vector test — but discovery isn't wired yet** (it'll still fail on `domain_bound`). Proceed to P3. **Step 9: Commit** `feat(aid-py): send AID-Domain and verify domain-bound PKA responses`.

### Task P3: wire discovery + surface domain_bound

**Files:** Modify `packages/aid-py/aid_py/discover.py`; Test `packages/aid-py/tests/test_pka_vectors.py`

- [ ] **Step 1:** (pass-vector test from P2 is the failing test here.)
- [ ] **Step 2: Run — expect FAIL** on `rec.get("domain_bound") is True`.
- [ ] **Step 3: `_perform_pka_for_record(record, timeout, *, queried_domain=None) -> bool`** (discover.py:46): v2 path returns `perform_pka_handshake(..., domain=queried_domain, ...)`; v1 returns `False`.
- [ ] **Step 4:** at both call sites (discover.py:151 and :245), capture `domain_bound = _perform_pka_for_record(record, timeout, queried_domain=domain_alabel)` and set `record["domain_bound"] = domain_bound` before the `return record, ttl`. (`domain_alabel` is in scope at line 126.)
- [ ] **Step 5: Run full Python suite — expect PASS**: `python3 -m pytest tests/test_pka_vectors.py -v`; **Step 6: Commit** `feat(aid-py): thread queried domain through discovery, expose domain_bound`.

---

# PHASE 3 — Rust (`packages/aid-rs`)

> Effort: M. Feature-gated `handshake` (the whole `src/pka.rs` is `#[cfg(feature = "handshake")]`). **Result-surfacing decision (deliberate):** Rust ships VERIFICATION-ONLY parity in this phase — it sends `AID-Domain`, verifies/rejects `aid-pka-v2-db` identically to the others, and `perform_pka_handshake` returns `Result<bool, AidError>`, but discovery DISCARDS the bool at the `?` boundary (Rust's `discover` returns `AidRecord`, which has no `domain_bound` field; adding a `DiscoveryResult` wrapper ripples through `well_known.rs` too). This is a documented gap vs the other four SDKs — call it out in the Phase 6 changeset ("Rust: verification parity; `domainBound` discovery surfacing is a fast-follow"). If you instead choose to surface it, add a `DiscoveryResult` wrapper and thread it through BOTH `discover.rs` and `well_known.rs`. The inline `v2_vector(id)` helper already loads shared vectors; the two db tests are plain `#[test]` (no mock server). Verify: `cargo test --features handshake --manifest-path packages/aid-rs/Cargo.toml`.

### Task R1: whitelist + tag-aware validation + parse-order fix

**Files:** Modify `packages/aid-rs/src/pka.rs`

- [ ] **Step 1: Failing inline test** (in `mod tests`): `rejects_v2_db_missing_aid_domain_coverage` loads `v2_vector("v2-db-missing-aid-domain-coverage")`, builds a `HeaderMap` from its response, and asserts `parse_v2_signature_headers` → `Err` with `ERR_SECURITY`.
- [ ] **Step 2: Run — expect FAIL**: `cargo test --features handshake --manifest-path packages/aid-rs/Cargo.toml v2_db -- --nocapture`
- [ ] **Step 3: Whitelist** `parse_v2_covered_item` (pka.rs:464): add `| "aid-domain"` to the `matches!`.
- [ ] **Step 4: `validate_v2_covered(covered, tag: &str)`** (pka.rs:470): `let domain_bound = constant_time_eq(tag.as_bytes(), b"aid-pka-v2-db"); let expected_len = if domain_bound {5} else {4};` len check; per-item `match` adds `"aid-domain" => true`.
- [ ] **Step 5: Reorder `parse_v2_signature_headers`** (pka.rs:503): move `validate_v2_covered(&covered)` to after `tag` is extracted; call `validate_v2_covered(&covered, &tag)`.
- [ ] **Step 6: Run — expect PASS**; **Step 7: Commit** `feat(aid-rs): tag-aware v2 covered-set validation for domain binding`.

### Task R2: handshake domain + sig base + result + discovery

**Files:** Modify `packages/aid-rs/src/pka.rs`, `src/lib.rs`, `src/discover.rs`, `src/well_known.rs`, `tests/pka_test.rs`

- [ ] **Step 1: Failing pass-vector inline test** `verifies_v2_db_domain_bound_vector` (loads the pass vector; parses headers; builds `build_v2_signature_base(&parsed, target_uri, authority, status, Some("example.com"))`; compares to `vector["signature_base"]`; Ed25519-verifies).
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: `canonicalize_aid_domain(&str) -> Result<String, AidError>`** (new, ~pka.rs:87) using `ascii_to_lowercase`, strip trailing dot, charset check `is_ascii_alphanumeric() || matches!(c, '.'|'-'|':'|'['|']'|'_')`.
- [ ] **Step 4: `build_accept_signature_v2(keyid, nonce, domain_bound: bool)`** (pka.rs:539) — raw-string covered/tag branch.
- [ ] **Step 5: `build_v2_signature_base(parsed, target_uri, authority, status, domain: Option<&str>)`** (pka.rs:546): `"aid-domain"` arm pushes `format!("\"aid-domain\";req: {}", d)` (Some) else returns empty Vec (fail-closed). Update the existing caller to pass `None`.
- [ ] **Step 6: `perform_v2_pka_handshake_with_controls(..., domain: Option<&str>) -> Result<bool, AidError>`** (pka.rs:578): canonicalize; re-bind builder `req = req.header("AID-Domain", d)` when Some; dual-tag check + reject `is_domain_bound && canonical_domain.is_none()`; pass `canonical_domain.as_deref()` to sig base; return `Ok(is_domain_bound)`.
- [ ] **Step 7: Thread through** `perform_pka_handshake_with_controls(..., domain)` (pka.rs:648, v1 → `Ok(false)`) and public `perform_pka_handshake(uri, pka, kid, timeout, domain: Option<&str>) -> Result<bool, AidError>` (pka.rs:644 + re-export `src/lib.rs:15`).
- [ ] **Step 8: ALL handshake call sites** — the public `perform_pka_handshake` signature change breaks every caller under `--features handshake`. There are FOUR call sites, not two:
  - `src/discover.rs` (lines 131-141): pass `Some(&alabel)` for v2, `None` for v1; discard the bool via `?`.
  - `src/well_known.rs` (line 84 v1 → add `None`; line 86 v2 → add `Some(domain)` — `domain: &str` is in scope at `fetch_well_known` ~line 33); discard via `?`.
    Without the `well_known.rs` fixups the crate won't compile under the `handshake` feature (which the tests require).
- [ ] **Step 9: Fix `tests/pka_test.rs` call sites** (lines 58, 95, 128): add `None` 5th arg; `assert!(res.is_err())` checks remain valid.
- [ ] **Step 10: Run full — expect PASS**: `cargo test --features handshake --manifest-path packages/aid-rs/Cargo.toml`; **Step 11: Commit** `feat(aid-rs): send AID-Domain and verify domain-bound PKA responses`.

---

# PHASE 4 — .NET (`packages/aid-dotnet`)

> Effort: M. **The load-bearing change is the validation-order refactor** (move `ValidateV2CoveredSet` to after the tag is parsed in `ParseV2SignatureHeaders`). Result surfacing: add `DomainBound` to `DiscoveryResult`. Header via `req.Headers.TryAddWithoutValidation("AID-Domain", ...)`. Verify: `dotnet test packages/aid-dotnet/AidDiscovery.sln --filter "FullyQualifiedName~PkaTests"`.

### Task N1: whitelist + validation-order refactor + tag-aware validation

**Files:** Modify `packages/aid-dotnet/src/Handshake.cs`; Test `packages/aid-dotnet/tests/PkaTests.cs`

- [ ] **Step 1: Failing fail-vector test** `V2DbMissingAidDomainCoverageIsRejected` (loads `v2-db-missing-aid-domain-coverage` via `V2Vector(id)`; mocks the response via `Pka.SendAsyncForTesting`; passes `domain` so the client requests db; asserts `AidError` with `ERR_SECURITY`).
- [ ] **Step 2: Run — expect FAIL**: `dotnet test ... --filter "FullyQualifiedName~V2Db"`
- [ ] **Step 3: Whitelist** `ParseV2CoveredItem` (Handshake.cs:553): add `or "aid-domain"`.
- [ ] **Step 4: Reorder `ParseV2SignatureHeaders`** (Handshake.cs:338-402): delete the `ValidateV2CoveredSet(covered)` call at line 361; parse params + extract `tag` first; then call `ValidateV2CoveredSet(covered, TimingSafeEqualString(tag, "aid-pka-v2-db"))`.
- [ ] **Step 5: `ValidateV2CoveredSet(covered, bool domainBound = false)`** (Handshake.cs:560): `if (domainBound) expected["aid-domain"] = true;` — count + req checks self-adjust.
- [ ] **Step 6: Run — expect PASS**; **Step 7: Commit** `feat(aid-dotnet): tag-aware v2 covered-set validation (validation-order fix)`.

### Task N2: handshake domain + sig base + result + discovery

**Files:** Modify `packages/aid-dotnet/src/Handshake.cs`, `src/Discovery.cs`; Test `packages/aid-dotnet/tests/PkaTests.cs`

- [ ] **Step 1: Failing pass-vector test** `V2DbDomainBoundVectorRunsAgainstHandshake` (asserts `request.Headers.GetValues("AID-Domain").Single() == aid_domain`; passes `domain:` 5th arg; asserts returned `bool` is true). Also add the `"aid-domain"` case to the test's `BuildV2Base` helper.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: `CanonicalizeAidDomain`** (new, after `AsciiToLower`): trim, lower, strip trailing dot, `Regex.IsMatch(value, @"^[a-z0-9.:\[\]_-]+$")` else `ERR_SECURITY`.
- [ ] **Step 4: `BuildAcceptSignatureV2(keyid, nonce, bool domainBound = false)`** (Handshake.cs:307) — branch covered/tag.
- [ ] **Step 5: `BuildV2SignatureBase(..., string? aidDomain = null)`** (Handshake.cs:680): `case "aid-domain"` appends `$"{item.Raw}: {aidDomain}"` (`item.Raw` is `"aid-domain";req`), throw if null.
- [ ] **Step 6: `PerformV2HandshakeAsync(uri, pka, timeout, string? domain = null) : Task<bool>`** (Handshake.cs:209): canonicalize; `TryAddWithoutValidation("AID-Domain", canonicalDomain)` when set; `BuildAcceptSignatureV2(..., canonicalDomain is not null)`; dual-tag check + reject `isDomainBound && canonicalDomain is null`; pass `canonicalDomain` to sig base; `return isDomainBound`.
- [ ] **Step 7: `public PerformHandshakeAsync(..., string? domain = null) : Task<bool>`** (Handshake.cs:162): v1 → `false`.
- [ ] **Step 8: Discovery.cs**: add `public bool DomainBound { get; init; }` to `DiscoveryResult` (line 16); `ParseSingleValid` returns `(AidRecord, bool)` and threads `queriedDomain`; `DiscoverAsync` passes `alabel` and sets `DomainBound` on the result. Well-known path leaves `DomainBound` default false.
- [ ] **Step 9: Fix the reflection test that calls `ParseSingleValid`** — `packages/aid-dotnet/tests/DiscoveryV2Tests.cs:7-19` invokes `ParseSingleValid` by reflection, passes 3 args, and casts the result to `(AidRecord)`. After Step 8 it returns a `ValueTuple` and takes a 4th param, so the cast throws `InvalidCastException` and the arg count throws `TargetParameterCountException` (breaking the 5 tests at lines ~29/42/55/68/81). Update the helper: pass the new 4th `queriedDomain` arg (use `"example.com"` or the query host the tests use) and unpack `((AidRecord, bool))method.Invoke(...)!).Item1`.
- [ ] **Step 10: Run full — expect PASS**: `dotnet test packages/aid-dotnet/AidDiscovery.sln`; **Step 11: Commit** `feat(aid-dotnet): send AID-Domain, verify domain-bound, expose DomainBound`.

---

# PHASE 5 — Java (`packages/aid-java`)

> Effort: M-L (logic is M; the L is the many existing-test call-site overloads). **Good news:** `AidV2Test.loadPkaVector` ALREADY reads `protocol/pka_vectors.json` (only the unrelated `HandshakeTest`/`vectors.json` is disconnected — leave it alone). Same validation-order fix as .NET. Result surfacing: add `domainBound` to `DiscoveryResult` (+ backward-compatible constructors). **Verify command:** there is NO `gradlew` wrapper inside `packages/aid-java/`; the wrapper is at the repo root and the module is registered as `:aid-java` (`settings.gradle`). Run from the **repo root**: `./gradlew :aid-java:test` (or scoped: `./gradlew :aid-java:test --tests "org.agentcommunity.aid.AidV2Test"`).

### Task J1: constants + whitelist-via-expected + validation-order fix + tag-aware

**Files:** Modify `packages/aid-java/.../Handshake.java`; Test `.../AidV2Test.java`

- [ ] **Step 1: Failing fail-vector test** `rejectsAid2DbTagWithoutAidDomainCoverage` (loads `v2-db-missing-aid-domain-coverage`; calls the new 7-arg `verifyV2Response(..., domain)`; asserts `AidError` `ERR_SECURITY`, message contains "required fields").
- [ ] **Step 2: Run — expect FAIL** (from repo root): `./gradlew :aid-java:test --tests "org.agentcommunity.aid.AidV2Test.rejectsAid2DbTagWithoutAidDomainCoverage"`
- [ ] **Step 3: Add constants** `AID_PKA_TAG_V2`/`AID_PKA_TAG_V2_DB`.
- [ ] **Step 4: `validateV2CoveredSet(covered, String tag)`** (Handshake.java:543): `boolean domainBound = AID_PKA_TAG_V2_DB.equals(tag); int expectedSize = domainBound ? 5 : 4;` + conditional `expected.put("aid-domain", true)`.
- [ ] **Step 5: Reorder `parseV2SignatureHeaders`** (Handshake.java:376): delete the early `validateV2CoveredSet(covered)`; after `tag` is extracted (line 384), call `validateV2CoveredSet(covered, tag)`.
- [ ] **Step 6: Run — expect PASS**; **Step 7: Commit** `feat(aid-java): tag-aware v2 covered-set validation (validation-order fix)`.

### Task J2: handshake domain + sig base + accept-signature + canonicalizer

**Files:** Modify `packages/aid-java/.../Handshake.java`; Test `.../AidV2Test.java`

- [ ] **Step 1: Failing tests** — `verifiesCanonicalAid2DbDomainBound` (loads pass vector; calls 7-arg `verifyV2Response(..., vector.get("domain").asText())`; expects no throw) AND `buildsCanonicalAid2DbAcceptSignatureHeader` (asserts `buildAcceptSignatureV2(thumbprint, nonce, true)` equals the vector's `request.accept_signature`).
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: `canonicalizeAidDomain(String)`** (new) — `asciiToLower`, strip trailing dot, `matches("^[a-z0-9.:\\[\\]_-]+$")` else `ERR_SECURITY`.
- [ ] **Step 4: `buildAcceptSignatureV2(keyid, nonce, boolean domainBound)`** (Handshake.java:284) — branch covered/tag.
- [ ] **Step 5: `buildV2SignatureBase(..., String domain)`** (Handshake.java:674): `else if ("aid-domain".equals(item.name))` appends `"\"aid-domain\";req: " + domain + "\n"` (throw if null).
- [ ] **Step 6: `verifyV2ResponseHeaders(..., String domain)`** (Handshake.java:302): dual-tag check + reject `isDomainBound && domain == null`; thread `domain` into `buildV2SignatureBase`. Add a 7-arg `verifyV2Response(..., String domain)` overload and keep the 6-arg one delegating with `null`.
- [ ] **Step 7: `performV2Handshake(uri, pka, timeout, String domain)`** (Handshake.java:258): `AID-Domain` header when non-null (`reqBuilder = reqBuilder.header(...)`); `buildAcceptSignatureV2(..., domain != null)`. `performHandshake(..., Duration timeout, String domain) : boolean` (Handshake.java:201) returns `domainBound`; keep a 4-arg overload delegating with `null`; v1 → `false`.
- [ ] **Step 8: Fix the existing `buildsCanonicalAid2AcceptSignatureHeader` test** (AidV2Test.java:753) to pass `false`.
- [ ] **Step 9: Run — expect PASS** for the new tests; **Step 10: Commit** `feat(aid-java): send AID-Domain and verify domain-bound PKA responses`.

### Task J3: wire discovery + surface domainBound

**Files:** Modify `packages/aid-java/.../Discovery.java`; Test `.../AidV2Test.java`

- [ ] **Step 1:** add a discovery-level test if the harness allows (else rely on J2's handshake tests + the wiring compile).
- [ ] **Step 2: Run — expect FAIL/compile error** until wiring lands.
- [ ] **Step 3: `DiscoveryResult`** (Discovery.java:27) gains `boolean domainBound` (4-arg ctor + 3-arg delegating ctor with `false`). `ParsedRecordWithTtl` (line 68) gains `boolean domainBound` (+ 2-arg delegating ctor). **Thread through the FULL chain — `discover` does NOT call `selectValidRecord` directly:** `discover` (line 191) → `parseSingleValid` (line 171) → `selectValidRecord` (line 116). So `parseSingleValid` (currently `(answers, timeout, queryName)`) ALSO needs a `String domain` parameter to bridge `alabel` from `discover` to `selectValidRecord`. Edit all three: `selectValidRecord(..., String domain)` threads `domain` into `performHandshake` and captures the returned bool onto `ParsedRecordWithTtl`; add a 4-arg `selectValidRecord` overload delegating with `null`; `parseSingleValid(..., String domain)` forwards it; `discover` passes `alabel` (in scope at line 181) and builds `DiscoveryResult` with `p.domainBound`. Well-known path → `false`.
- [ ] **Step 4: Fix existing `ParsedRecordWithTtl`/`selectValidRecord`/`parseSingleValid` call sites** in AidV2Test (use the delegating overloads / pass `null`).
- [ ] **Step 5: Run full Java suite — expect PASS** (from repo root): `./gradlew :aid-java:test`; **Step 6: Commit** `feat(aid-java): thread queried domain through discovery, expose domainBound`.

---

# PHASE 6 — Peripheral docs sweep + changeset + verification

### Task Z1: peripheral / quickstart docs

**Files:** Modify `README.md`, `EXAMPLES.md`, `AGENTS.md`, `packages/aid/README.md`, `packages/aid-doctor/README.md`, `packages/docs/quickstart/index.md` + the 6 language quickstarts (`quickstart_go.md`, `quickstart_python.md`, `quickstart_rust.md`, `quickstart_dotnet.md`, plus any TS/JS quickstart)

- [ ] **Step 1:** add a brief domain-binding mention to each where PKA is described: clients send `AID-Domain` by default and report `domainBound`; point to spec Appendix B.7. Keep the honesty caveat (requesting ≠ mitigating; only `require` enforces) consistent with the core docs. Per-language quickstarts: note the SDK now sends `AID-Domain` and exposes the per-SDK `domainBound`/`DomainBound`/`domain_bound` field.
- [ ] **Step 2:** `pnpm docs:export && pnpm docs:verify` — **must exit 0**; commit the regenerated `export-manifest.json` + `.sha256` WITH the docs (this is a known CI gate — verify exit 0 on the committed state).
- [ ] **Step 3: Commit** `docs: domain-binding mentions in readmes and quickstarts`.

### Task Z2: changeset + full verification

**Files:** Create `.changeset/sdk-parity-domain-binding.md`

- [ ] **Step 1:** create the changeset (the non-TS SDKs aren't separate npm packages — they're tested via parity but versioned differently; the user-facing change is that all SDKs now do domain binding). Use:

```markdown
---
'@agentcommunity/aid': patch
---

All official SDKs (Go, Python, Rust, .NET, Java) now reach parity with the TypeScript SDK's PKA domain-binding profile: they send `AID-Domain` by default for v2 PKA, verify the `aid-pka-v2-db` tag and `"aid-domain";req` covered component, and surface a `domainBound` result (Rust verifies and rejects identically; surfacing `domainBound` through Rust discovery is a fast-follow). Unbound `aid-pka-v2` proofs remain valid.
```

(If the Go/Py/Rust/.NET/Java packages have their own version files — `aid-go` go.mod, `aid-py` pyproject, etc. — bump those per each ecosystem's release convention instead of/in addition to the changeset; check `.changeset/config.json` ignore list and each package's release tooling.)

- [ ] **Step 2: Full verification:**
  - `pnpm build && pnpm test && pnpm lint` — green.
  - `pnpm test:parity` — TS+Go+Python parity now EXERCISES the v2-db vectors in Go and Python (previously inert). Must be green.
  - Per-SDK suites not in the parity harness (from repo root): `cargo test --features handshake --manifest-path packages/aid-rs/Cargo.toml`; `dotnet test packages/aid-dotnet/AidDiscovery.sln`; `./gradlew :aid-java:test`.
- [ ] **Step 3: Commit** `chore: changeset for non-TS SDK domain-binding parity`.

---

## Cross-cutting notes

- **Vector-test inertness ends here.** Before this plan, the Go/Python/etc. PKA vector tests filtered to `aid1` or selected by id, so the `v2-db-*` vectors were inert. Each SDK phase adds explicit `v2-db` tests, so after Phase N that SDK actively verifies the profile. Confirm no SDK's "iterate all vectors" test newly picks up `v2-db-*` in a way that breaks (the v2-db vectors are `v=aid2`; SDKs that iterate-and-skip-non-aid1 stay safe; SDKs that select-by-id only run what you name).
- **Canonicalization must match byte-for-byte across SDKs** — the verifier rebuilds the `aid-domain` line from its own canonical domain, and the signer (TS demo / other endpoints) canonicalizes identically. Use the shared recipe charset exactly; the shared vectors pin `example.com` (already canonical), but the canonicalizer is exercised by discovery passing real hosts.
- **No DNS, spec, or TS changes** in this plan. If a phase reveals a spec ambiguity, stop and escalate rather than diverge.
- **Each phase is independently shippable.** Stop after any SDK; the rest stay backward-compatible non-supporting clients.

---

## Self-Review

**Spec coverage:** the 8-step recipe maps to tasks in every phase (whitelist, tag-aware validation+reorder, accept-signature, sig-base, handshake+header+canonicalize, discovery wiring, result surfacing, two vector tests). Docs + changeset in Phase 6. ✅

**Placeholder scan:** each phase embeds concrete, current-code-grounded edits (file:line anchors + language code from the per-SDK scouts). Test steps name the vectors and assertions. A few steps say "mirror the file's existing harness" for test scaffolding that varies per SDK — pointers to real symbols, not missing logic; flagged where they occur. ✅

**Consistency:** the contract (tag `aid-pka-v2-db`, covered `"aid-domain";req`, canonicalization charset, dual-tag accept, reject db-without-domain, reject db-without-coverage, `domainBound` semantics) is identical across all five phases; only the result-surfacing shape differs per language (documented per phase: Go `DiscoveryResult` struct, Python record-dict key, Rust discard-at-`?`, .NET `DiscoveryResult.DomainBound`, Java `DiscoveryResult.domainBound`). ✅
