# AID Full Codebase Review

> Generated 2026-06-14 · branch `feat/pka-domain-binding` (PR #145) · 15-stream Opus review + adversarial verification + completeness critics.
> Run `wf_e6c2dbb4-911` · 178 agents · 354 distinct files reviewed.

> **Resolution (2026-06-14):** the **1 critical + 9 high + 44 medium** findings were fixed via 12 isolated per-package fix streams + 1 dedicated cross-SDK parity task (commits `4c8cf3ce..f67ab606`). The **72 low + 20 info** were then fixed via a second 14-stream wave (commits `b645ee66..3b110eae`) — ~89 of 92 closed. **Three deliberately deferred:** (1) `RBT-02` — enabling `exactOptionalPropertyTypes` on `packages/web` surfaces 43 pre-existing errors in unrelated UI components (disproportionate to a low finding); (2) `go-6` CI half — adding a `gofmt`/`go vet` gate to `.github/workflows/ci-go.yml` (the code-formatting half was done); (3) `test-gap-1` — an e2e test-coverage gap in `packages/e2e-tests/src/pka_e2e.ts`. All work verified green across all 6 SDKs + `build`/`test`/`lint`/`test:parity`/`docs:verify`.

## Authoritative counts (deterministic, from verifier verdicts)

- **Confirmed:** 117 — 1 critical, 7 high, 37 medium, 55 low, 17 info
- **Dismissed by verifiers:** 18 · **Disputed/unverified:** 0 · **Raw:** 135
- **By stream (confirmed):** protocol:3 · aid:5 · engine-doctor:9 · aid-go:10 · aid-py:8 · aid-rs:10 · aid-dotnet:8 · aid-java:8 · web-api:7 · web-ui:6 · docs-spec:3 · docs-quickstart:10 · parity:5 · ci-release:16 · misc-md:9

> Note: the synthesis prose below independently re-tallied counts (~92) and stamped a stale date/branch; the deterministic numbers above are authoritative.

---

## Synthesis report

# AID Codebase Review — Final Report

**Reviewers:** 15-stream Opus review + adversarial verification + two completeness critics
**Date:** 2026-06-12 · **Branch:** `smart/hardcore-almeida-0de44d`
**Files reviewed:** 354 · **Confirmed findings:** 92 · **Disputed:** 0 · **Dismissed by verifiers:** 18

---

## 1. Executive Summary

**Overall health: solid core, leaky edges.** The protocol logic, PKA cryptography, and the TypeScript reference SDK are well-built and well-tested. The risk concentrates in three bands: (1) two functional defects in the Go and Java SDKs that break or crash discovery; (2) a server-side SSRF surface in the web handshake proxy that relies almost entirely on a Cloudflare platform flag rather than app-level defense; and (3) a broad, recurring belt of cross-language parity drift, doc-vs-code mismatches, and CI gates that are green but enforce nothing.

The single most important structural finding is meta: **CI gives false confidence in several places** — the Java suite runs only an unrelated synthetic test, the conformance vector gate never asserts `failed === 0`, the macOS doctor matrix only compiles, the license check samples 10 files and never fails, and the PyPI publish step is unconditional. Several real bugs survive a fully green pipeline precisely because of these gaps.

### Counts by severity (confirmed only)

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 8 |
| Medium | 45 |
| Low | 31 |
| Info | 7 |
| **Total** | **92** |

### Top 5 to fix first

1. **[CRITICAL] Java DoH query name is corrupted** — `Discovery.java:101`. `substring(3)` strips the leading slash *plus the first two characters* of every FQDN, so `_agent.example.com` is queried as `gent.example.com`. Every Java DNS-first discovery silently fails to the fallback. Change to `.substring(1)`. Zero test coverage.
2. **[HIGH] Go parser panics (DoS) on a malformed TXT pair** — `aid-go/parser.go:24-26`. `panic("invalid pair")` with no `recover()` anywhere; a bare token in an attacker-controlled TXT record crashes the host goroutine instead of returning `ERR_INVALID_TXT`. (Same defect in `parity-2`.)
3. **[HIGH] Handshake proxy SSRF blocklist is materially incomplete** — `web/src/app/api/handshake/route.ts:185-190`. Allows `169.254.169.254` (cloud metadata), all IPv6 (`::1`, `[::ffff:127.0.0.1]`), `0.0.0.0`, and all of `127.0.0.0/8` except the literal `127.0.0.1`. Only saved in prod by the `global_fetch_strictly_public` Worker flag.
4. **[HIGH] Python & Go quickstarts/READMEs document an API that does not exist** — `docs/quickstart/quickstart_python.md:21-24`, `docs-go-1` / `go.mod` import-path mismatch, `docs/quickstart/index.md:25-30` invented `generate` flags. The first, most-copied examples throw `AttributeError` / fail to compile / error with `unknown option`.
5. **[HIGH] PyPI publish step is unconditional with no `skip-existing`** — `.github/workflows/release.yml:55-65`. An npm-only release re-uploads the unchanged `aid-discovery` version, the publish action fails on the duplicate, and the run goes red *after* npm has already published — a half-broken release state.

---

## 2. Confirmed Findings

### Critical (1)

**`java-1` — DoH query name corrupted by `substring(3)`**
`packages/aid-java/src/main/java/org/agentcommunity/aid/Discovery.java:101`
`queryTxtDoH` builds the Cloudflare DoH name as `URI.create("http://x/"+fqdn).getRawPath().substring(3)`. `getRawPath()` returns `/<fqdn>` (the fqdn is unreserved, never percent-encoded), so `substring(3)` removes the leading `/` *and the first two fqdn characters*. `_agent.example.com` → `gent.example.com`; `_agent._mcp.example.com` → `gent._mcp.example.com`. Every DNS-first discovery queries the wrong name, gets NXDOMAIN, and silently falls through to `.well-known` (or fails). Reached by every `discover()` call, covered by zero tests, and CI runs only `HandshakeTest`, so it is completely unguarded.
**Fix:** change to `.substring(1)` (or percent-encode the fqdn properly) and add a unit test asserting the exact DoH URL for `_agent.example.com` and `_agent._mcp.example.com`.

---

### High (8)

**`go-1` / `parity-2` — Go `parseRaw` panics instead of returning `ERR_INVALID_TXT`**
`packages/aid-go/parser.go:24-26` (and `:25`)
A TXT segment without `=` triggers `panic("invalid pair")`. The comment claims `validate` catches it, but `parseRaw` runs inside public `Parse` *before* `ValidateRecord`, and there is no `recover()` in the package. `Parse("v=aid2;foo;u=https://x/mcp;p=mcp")` crashes the goroutine — verified by reproduction. Every other SDK returns a typed `ERR_INVALID_TXT`. DNS TXT content is attacker-influenceable, so this is both a parity violation and a denial-of-service.
**Fix:** make `parseRaw` return `(map[string]string, error)` emitting `newAidError("ERR_INVALID_TXT", "Invalid key-value pair: "+p)`; propagate through `Parse`. Add a negative golden fixture.

**`ssrf-1` — `isPrivateHost` SSRF blocklist misses metadata/IPv6/loopback/0.0.0.0**
`packages/web/src/app/api/handshake/route.ts:185-190` (duplicated in `lib/api/handshake-security.ts:3-8`)
The handshake POST route is a server-side discovery proxy fetching attacker-supplied URIs. Its only SSRF defense, `isPrivateHost`, allows `169.254.169.254` (AWS/GCP/Azure IMDS), all IPv6 (`[::1]`, `[fd00::1]`, `[::ffff:127.0.0.1]`), `0.0.0.0`, and all of `127.0.0.0/8` except literal `127.0.0.1` — verified by running the function. The deployed Worker is saved by `global_fetch_strictly_public` (`wrangler.jsonc:6`), but that is a platform flag, not the documented Node/self-hosted defense.
**Fix:** parse the host as an IP (handle bracketed IPv6), block `169.254.0.0/16`, `fe80::/10`, full `127.0.0.0/8`, `0.0.0.0`, `::1`, `fc00::/7`, and IPv4-mapped IPv6. Keep the platform flag as defense-in-depth, not the sole control. Consolidate the duplicated copy (see `dry-1`).

**`docs-py-1` — Python quickstart first example uses object access on a tuple return**
`packages/docs/quickstart/quickstart_python.md:21-24`
Shows `result = discover(...)` then `result.record.proto / result.ttl`, but `discover()` returns `(record_dict, ttl)` (`aid-py/aid_py/discover.py:88`) and the record is a plain dict. `result.record` raises `AttributeError`. The file's own Options section uses the correct tuple-unpack form, so it contradicts itself. Propagated from `aid-py/README.md:25-28`.
**Fix:** `record, ttl = discover(...)` then `print(record["proto"], record["uri"], record.get("desc"), ttl)`; use `record.get("domain_bound")`. Fix the README too.

**`docs-go-1` / `go-10` — Go quickstart + README import path doesn't match `go.mod`**
`packages/docs/quickstart/quickstart_go.md:12,25` and `aid-go/go.mod:1`
Docs use `github.com/agentcommunity/agent-identity-discovery/aid-go`, but `go.mod` declares `module github.com/agentcommunity/aid-go`. `go get`/build fails on the module-path mismatch. The wrong path also recurs across `aid-go/README.md`.
**Fix:** reconcile docs and `go.mod` on a single canonical path; they must agree or `go get` fails.

**`docs-index-1` — Quickstart "Publish An Agent" uses non-existent `generate` flags**
`packages/docs/quickstart/index.md:25-30`
Runs `aid-doctor generate --uri ... --proto ... --desc ...`, but `generate` is interactive-only and defines only `--save-draft <path>` (`aid-doctor/src/cli.ts:385-388`). Commander v12 with no `allowUnknownOption()` errors with `unknown option '--uri'` and exits non-zero. The Tooling doc documents it correctly, so `index.md` contradicts both the CLI and the sibling doc.
**Fix:** show the interactive form (or add real non-interactive flags if a scriptable mode is wanted).

**`ci-3` — PyPI publish is unconditional with no `skip-existing` guard**
`.github/workflows/release.yml:55-65`
The release job always rebuilds and re-uploads `aid-discovery` with no version gating and no `skip-existing`. On an npm-only release the unchanged PyPI version triggers a duplicate-version failure *after* npm has published — a partial-release red state.
**Fix:** add `skip-existing: true`, or gate the Python block on a detected `aid-py/pyproject.toml` version change; ideally split npm and PyPI into independent jobs.

**`aid-1` — Protocol/auth token validation uses `in`, accepting `Object.prototype` members**
`packages/aid/src/parser.ts:279,284` (and `isValidProto` at `:413`)
`!(protoValue in PROTOCOL_TOKENS)` walks the prototype chain, so `proto=constructor`, `toString`, `hasOwnProperty`, `valueOf`, `__proto__`, and `auth=constructor` validate. Verified: `parse('v=aid2;u=https://api.example.com/mcp;p=constructor')` is accepted and returns `proto:'constructor'`, breaking the `ProtocolToken` type contract. Go (`parser.go:83`) and Python (`parser.py:176`) reject these via map/dict lookup — TS is the only outlier.
**Fix:** use `Object.prototype.hasOwnProperty.call(...)`, `Set`-based lookups, or `Object.create(null)`; apply to `isValidProto`. Add negative parity vectors.

**`aid-2` — Malformed PKA `Signature` throws raw `DOMException`, causing fail-open downgrade to `.well-known`**
`packages/aid/src/pka.ts:579 (V2), 245 (V1)`
`base64ToUint8` calls `atob` unguarded; a non-base64 `Signature` value throws a `DOMException` (verified), not an `AidError`. In `client.ts` this is mapped to `ERR_DNS_LOOKUP_FAILED` (`:468`), which triggers the `.well-known` fallback (`:534-538`). A failed endpoint proof is silently masked and retried over a different trust path — contradicting `specification.md:510` (discovery MUST fail when the selected record contains `k`). The well-known path converts the same exception to `ERR_FALLBACK_FAILED`, also masking a security failure.
**Fix:** wrap the signature base64 decode so any failure throws `AidError('ERR_SECURITY', 'Invalid PKA signature encoding')`. Add negative tests asserting `ERR_SECURITY` and that `discover()` does *not* fall back when a DNS-record PKA proof fails.

---

### Medium (45)

**`protocol-1` — Conformance CI gate asserts only `total > 0`, never `failed === 0`**
`packages/aid-conformance/src/runner.test.ts:24-32`
The only conformance suite wired into CI runs the real PKA vectors but never asserts no failures, so a regressed vector (e.g. a pass vector whose Ed25519 signature stops verifying) would not fail this test. The CLI `main()` sets `process.exitCode` from `failed`, but no script/CI step invokes it against real vectors — the exit-code gate is dead in CI. Mitigated by per-language SDK tests, hence medium.
**Fix:** also assert `expect(result.categories.pkaVectors.failed).toBe(0)` (and the same for records/recordSets/policies), or wire the runner CLI into CI.

**`aid-2` (security, above)** — also tracked as the malformed-signature fail-open; see High.

**`parity-1` (engine-doctor) — `classifySecurityChange` diverges between engine and doctor**
`packages/aid-doctor/src/cache.ts:196-197`
Engine uses `previous.keyid ?? derivePkaKeyid(previous.pka)?.keyid ?? previous.pka`; doctor omits the derive fallback. When `previous` has `pka` set but `keyid:null`, the doctor false-positives `key_replaced` (verified with the shared aid2 key). Under `--downgrade-policy fail` this sets exit 1003 and refuses to persist — a false security failure. The doctor's copy is the one used at runtime.
**Fix:** make doctor's extraction identical to engine's, or extract one shared `classifySecurityChange` into aid-engine. Add a cross-package agreement test including the pka-set/keyid-null case.

**`test-gap-1` (engine-doctor) — Conformance suite never pins the two domain-binding vectors**
`packages/aid-conformance/src/index.test.ts:48-67`
The expected-PKA-vector-ID list omits `v2-db-rfc9421-domain-bound` (pass) and `v2-db-domain-mismatch` (fail), both present in `pka_vectors.json:416,452`. They run in the default pack but nothing pins their presence or expected classification; a future edit dropping or mislabeling them would pass.
**Fix:** add both IDs to the `arrayContaining` assertion and add a `runner.test.ts` case asserting pass/fail.

**`go-2` / `parity-3` — Go silently accepts duplicate and empty keys (last-write-wins)**
`packages/aid-go/parser.go:15-32`
`parseRaw` has no duplicate-key or empty-key/value guard. `Parse("v=aid1;u=...;p=mcp;p=a2a")` returns `Proto="a2a", err=nil`; `v=aid1;v=aid2;...` returns `aid2`; `=foo;...` parses. Every other SDK rejects with `ERR_INVALID_TXT`. An attacker appending a second `uri`/`pka`/`v` pair is resolved differently by Go than by other clients.
**Fix:** reject duplicate keys and empty key/value, matching `parser.ts:131-137`. Add shared golden fixtures.

**`go-3` — README documents wrong `DiscoverWithOptions` signature; example doesn't compile**
`packages/aid-go/README.md:60-73`
README heads it as returning `(AidRecord, uint32, error)` with `rec, ttl, err := ...`, but the real function returns `(DiscoveryResult, error)` (`discover.go:54`). Wrong arity; `res.Record/res.TTL/res.DomainBound` are the real accessors, and `DomainBound` is undocumented. The struct doc (`:108-116`) also omits Docs/Dep/Pka/Kid.
**Fix:** update heading/example to `res, err := ...` and document `DomainBound` plus the missing fields.

**`docs-1` (aid-py) — Python README documents a `DiscoveryResult` object that doesn't exist**
`packages/aid-py/README.md:18-32,36,48-50,84-89`
Shows `result.record.proto / result.ttl` and a `DiscoveryResult` type; `discover()` returns a `(dict, int)` tuple and there is no `DiscoveryResult` class anywhere. Verbatim copy raises `AttributeError`.
**Fix:** rewrite Quick Start / Returns / Data Types to the real `(record_dict, ttl)` tuple and dict-key access, or introduce a real `DiscoveryResult` dataclass (which would also help `parity-1`).

**`parity-1` (aid-py) — `domain_bound` mutated into the `AidRecord` dict instead of a separate result field**
`packages/aid-py/aid_py/discover.py:152-153,247-248`
Python injects `record['domain_bound']` into the returned record; every other SDK exposes it on the discovery result. Consequences: it is off-schema for the `AidRecord` TypedDicts, `as_v1()/as_v2()` don't strip it, and JSON serialization emits a non-spec field.
**Fix:** surface it via a small result object/named-tuple (matching Go/TS), or at minimum add `domain_bound` to the TypedDict.

**`rust-1` / `docs-1` (misc-md) — Rust README `perform_pka_handshake` example passes 4 args, signature needs 5**
`packages/aid-rs/README.md:101`
The v2 example omits the `domain: Option<&str>` parameter added for domain binding; Rust has no default args, so it fails with E0061. Not caught because the crate has no doctest harness.
**Fix:** pass the 5th arg (`Some("example.com")` or `None`); consider wiring the README as a compiled doctest.

**`rust-2` — Well-known fallback silently compiled out under default features**
`packages/aid-rs/src/discover.rs:150-155`
The fallback branch is gated by `#[cfg(feature = "handshake")]` *inside* the `if options.well_known_fallback` block, and `default = []` (`Cargo.toml:27`). In a default build the fallback is compiled out and `well_known_fallback: true` is silently ignored, contradicting the doc comment and README and diverging from Go/Python (which fall back unconditionally). The empty `if` body emits no dead-code warning.
**Fix:** keep `fetch_well_known` always compiled (gate only the PKA verification), or fail-loud when the feature is disabled; at minimum document the requirement.

**`rust-3` — No end-to-end v2 PKA handshake test; fail-closed invariant untested**
`packages/aid-rs/src/pka.rs:628-710`
`HandshakeControls` has `v2_nonce`/`now_epoch_seconds` hooks but no test sets them. The entire v2 request/response flow — including the central fail-closed check at `:700-702` — is untested, plus AID-Domain header, no-store rejection, nonce/tag/keyid mismatch, redirect rejection, and freshness/skew. v1 has a controlled mock test; v2 (the primary version) has none.
**Fix:** add httpmock tests driving `perform_v2_pka_handshake_with_controls` for happy-path domain-bound, fail-closed, missing no-store, nonce/tag/keyid mismatch, and redirect rejection.

**`dotnet-2` — Domain-binding negative paths untested in .NET**
`packages/aid-dotnet/tests/PkaTests.cs` (missing tests)
The fail-closed rule at `Handshake.cs:288-291`, the unbound `domainBound=false` case, and `CanonicalizeAidDomain` validation (`:35-38`) have zero coverage. TS has 6 domain-binding tests; .NET has 3.
**Fix:** add the three missing tests mirroring TS (fail-closed `ERR_SECURITY`, unbound returns false, invalid AID-Domain throws).

**`java-3` — No fail-closed negative test in Java**
`packages/aid-java/src/test/java/org/agentcommunity/aid/AidV2Test.java:773`
The fail-closed check exists (`Handshake.java:394-396`) but nothing exercises a response covering `aid-domain` with `domain=null`. Go and TS both have explicit tests asserting the exact message. A regression dropping the check would pass the Java suite.
**Fix:** load `v2-db-rfc9421-domain-bound`, call the 6-arg `verifyV2Response` with no domain, assert `ERR_SECURITY` containing "no AID-Domain was sent".

**`java-5` — `verifyV2Response` test overloads discard the `domainBound` return value**
`packages/aid-java/src/main/java/org/agentcommunity/aid/Handshake.java:330`
The test overloads return `void`, so `verifiesCanonicalAid2DbDomainBound` only asserts "should not throw" and never asserts `domainBound=true` for bound or `false` for unbound. The derived-from-coverage contract is not directly asserted on the verify path.
**Fix:** return the boolean and assert `true`/`false` against the bound/unbound vectors, matching Go/TS.

**`java-6` — Entire V1 PKA handshake path untested in Java**
`packages/aid-java/src/main/java/org/agentcommunity/aid/Handshake.java:216`
`performV1Handshake`, `multibaseDecode`, `Base58.decode`, the V1 signature base, the ±300s windows, the keyid/alg checks — none are tested. `HandshakeTest` is an unrelated synthetic JWS toy. `Base58.decode` has nontrivial BigInteger sign-byte / leading-`1` handling that is entirely unverified.
**Fix:** add a data-driven test loading the aid1 vectors and driving `performV1Handshake` via a local `HttpServer`, plus a direct `Base58.decode` edge test.

**`java-7` — `HandshakeTest` + private `vectors.json` are misleading dead test code**
`packages/aid-java/src/test/java/org/agentcommunity/aid/HandshakeTest.java:18`
It imports nothing from `org.agentcommunity.aid`, uses its own KeyRing/JWS helpers and a private 3-entry vectors file, and validates none of Parser/Handshake/Discovery/Constants — yet it is the single test CI runs, giving a false Java coverage signal. The name implies it tests `Handshake`, which it does not.
**Fix:** delete it (and its `vectors.json`) or rewrite it to drive the real `Handshake` against the shared vectors; stop relying on it as the CI signal.

**`ssrf-2` — A2A agent-card fetch follows redirects, bypassing `isPrivateHost`**
`packages/web/src/lib/protocols/handlers/a2a.ts:28-34`
`isPrivateHost` checks only the original hostname (`route.ts:62`); the A2A card fetch uses default `redirect:'follow'`, so an allowlisted host can 301 to `169.254.169.254` or `127.0.0.1:6379`. The MCP HEAD probe uses `redirect:'manual'`, but the A2A fetch does not.
**Fix:** set `redirect: 'manual'`, re-run the host check on any redirect `Location`, or refuse redirects for discovery fetches.

**`ssrf-3` — Handshake MCP HEAD probe has no timeout**
`packages/web/src/app/api/handshake/route.ts:94`
The HEAD probe has `redirect:'manual'` but no `AbortSignal`/timeout, so a slow-loris target pins the Worker/Node request until the platform hard limit. A2A uses `AbortSignal.timeout(5000)`.
**Fix:** add `signal: AbortSignal.timeout(3000)`.

**`test-1` — Handshake POST route has zero direct test coverage**
`packages/web/src/app/api/handshake/route.ts:51-180`
Nothing exercises the route handler; the SSRF block, unsupported-scheme 401, compliant-auth probe, and `buildAuthError` mapping are all untested. The misleadingly named `handshake-route-security.test.ts` never touches the route. This is the highest security-surface route, so the `ssrf-1` gaps could silently widen.
**Fix:** add route-level POST tests for "Target host not allowed", invalid JSON, 401 unsupported-scheme, and the needsAuth mapping. Rename/relocate the misnamed test.

**`docs-toc-1` — Docs TOC links/scroll-spy break for 40 headings (custom slug ≠ rehype-slug)**
`packages/web/src/lib/docs/content.ts:70-90` (also `scripts/generate-docs-index.ts:78-101`)
Stored heading ids use a custom `slugify` that collapses `-+` and doesn't dedupe; the DOM ids come from `rehype-slug` (github-slugger), which preserves double hyphens around `&`/`—`/`/`/`()` and appends `-1` to duplicates. 40 of 526 headings mismatch (verified against github-slugger@2.0.0). The `Reference/protocols` TOC is entirely non-functional for its protocol sections; clicks do nothing and scroll-spy never fires.
**Fix:** generate ids with github-slugger (one slugger per document) in the index generator, or feed precomputed ids into the headings via a rehype plugin. Add a test that every `heading.id` resolves.

**`wellknown-aid1-1` — Self-hosted `.well-known/agent` dogfood still serves `v=aid1`**
`packages/web/src/app/.well-known/agent/route.ts:13-19`
The site's own fallback returns `v:'aid1'` pointing at `/api/pka-demo`, which only implements the v2 PKA handshake — an aid1 document pointing at a v2-only endpoint. The codebase is v2-normative (`well_known_json.md:22` uses `aid2`; `web-v2-surface.test.ts` enforces it).
**Fix:** update the dogfood JSON to `v:'aid2'` with the current key set; add a test asserting it parses as aid2.

**`docs-py-2` — Python quickstart `parse()` example uses attribute access on a dict**
`packages/docs/quickstart/quickstart_python.md:53-55`
`rec = parse("...")` then `print(rec.uri)`; `parse()` returns an `AidRecord` TypedDict (a plain dict), so `rec.uri` raises `AttributeError`.
**Fix:** `print(rec["uri"])`.

**`docs-engine-2` — `runCheck` called with one argument, but `opts` is required**
`packages/docs/Tooling/aid_engine.md:164`
`runCheck('example.com')` with no options; the real signature requires `opts: CheckOptions` with `timeoutMs`/`allowFallback`/`wellKnownTimeoutMs`. The snippet throws when the engine reads `opts.timeoutMs` on undefined.
**Fix:** pass a valid options object.

**`parity-1` (parity stream) — Past `dep` timestamp produces three different behaviors across the 6 SDKs**
`aid-java/Parser.java:150-151`; `aid/client.ts:268-282`; Go/Py/Rust/.NET absent
For a well-formed record with a past `dep`: TS discovery fails (`ERR_INVALID_TXT` at the client layer); Java *parse* fails (deprecation check wrongly in the low-level parser); Go/Py/Rust/.NET silently succeed (no deprecation handling). The golden `dep` fixture uses a future date (2099), so CI never exercises the past-dep path. Spec `specification.md:138` says this is a discovery-layer SHOULD.
**Fix:** keep `parse()` format-only in all SDKs (remove Java's check), implement the discovery-layer guidance uniformly in Go/Py/Rust/.NET to match TS, add a past-`dep` golden fixture, and reconsider whether `ERR_INVALID_TXT` is the right code for a valid-but-deprecated record.

**`parity-4` — Shared parity/conformance harness can't catch parser-edge divergences**
`test-fixtures/golden.json` (invalid[]); `packages/aid-conformance/src/runner.ts:53-56`
`golden.json`'s `invalid[]` has no malformed-pair, empty-key/value, or duplicate-same-key case (the only dup fixture is full-vs-alias, which Go handles). Separately, the conformance runner only ever imports/calls the TS parser, so "conformance green" doesn't imply non-TS parser parity. Together these let `parity-2`/`parity-3` go undetected.
**Fix:** add malformed-pair, empty-key, empty-value, and duplicate-same-key invalid fixtures (each `errorCode: ERR_INVALID_TXT`); document that aid-conformance is TS-only and that cross-language enforcement lives in each SDK's parity test.

**`ci-1` — CodeQL matrix includes `rust` (preview-only) with no toolchain in the job**
`.github/workflows/security.yml:24,95`
CodeQL Rust is public-preview, not GA in the configured query suites, and the `rust` leg installs no Rust toolchain; autobuild runs unconditionally. The leg will fail in `init` or `autobuild` and is permanently red/no-op.
**Fix:** remove `rust` from the CodeQL matrix (cover via `cargo audit`/clippy) or gate it on a CodeQL version that supports Rust and add toolchain setup.

**`ci-2` — Only npm + PyPI are automated; crates.io, NuGet, Maven Central have no publish automation**
`.github/workflows/release.yml:1-65`
Rust, .NET, and Java SDKs are all versioned 2.0.0 for distribution but have zero release automation (no `cargo publish`/`dotnet nuget push`/`gradle publish`). Three of six advertised SDKs can only be released by undocumented manual steps and will drift behind npm/PyPI.
**Fix:** add publish jobs (or a documented runbook) for crates.io, NuGet (csproj needs `PackageId`/`IsPackable`), and Maven Central (build.gradle needs maven-publish + signing); otherwise drop the first-class implication.

**`ci-4` — showcase-dns purge loop is broken for >100 records**
`.github/workflows/showcase-dns.yml:55-69`
The purge paginates `per_page=100` and deletes per page before fetching the next; deleting page 1 shifts later records into freed slots that are never seen, and it recomputes `total_pages` over all TXT records (not just `_agent.*`). Correct today only because the zone has ~17 records; beyond 100 TXT records it silently orphans `_agent.*` records.
**Fix:** re-fetch page 1 after each delete batch, or collect all ids first then delete, or filter server-side by name.

**`ci-6` — `doctor-e2e-matrix` builds on two OSes but runs no test/check/CLI**
`.github/workflows/ci-typescript.yml:61-79`
The job's only functional step is "Build aid and aid-doctor" — no CLI invocation, no `e2e:pka`, no assertion. The macOS leg (the only macOS coverage in CI) verifies nothing beyond "it compiles".
**Fix:** add a real doctor invocation/e2e step, or delete the job.

**`ci-7` — trufflehog pinned to floating `@main`**
`.github/workflows/security.yml:56,65`
Both secret-scanning steps run whatever is at `trufflesecurity/trufflehog@main` with the repo checked out — a supply-chain exposure, ironically inside the security workflow. Every other third-party action is tag-pinned.
**Fix:** pin to a release tag or full commit SHA.

**`ci-8` — License compliance check samples 10 files and never fails**
`.github/workflows/security.yml:70-72`
`find ... | head -10` inspects at most 10 files and only `echo`s on a missing header — never `exit 1`. The `find` also lacks `\( ... \)` grouping around `-o`. The gate enforces nothing while appearing to.
**Fix:** drop `head -10`, group predicates, collect violations and `exit 1`; or remove the step.

**`ci-14` — No concurrency group on 10 of 11 workflows; destructive showcase-dns can race**
`.github/workflows/showcase-dns.yml:12-18`
Only `ci-parity.yml` has a concurrency group. Two close main pushes can run the showcase-dns purge+terraform-apply concurrently against the same zone with ephemeral state — a race that can delete records mid-apply.
**Fix:** add `concurrency: { group: showcase-dns-${{ github.ref }}, cancel-in-progress: false }` to showcase-dns, and standard cancel-in-progress groups to build/test/security workflows.

**`docs-1` (misc-md) — Rust README handshake example doesn't compile** — duplicate of `rust-1`; same `README.md:101` / 5-arg signature. .NET and Java READMEs use the same shape but compile (default arg / 4-arg overload); only Rust is broken.

**`docs-2` (misc-md) — README CI badge points to non-existent `ci.yml`**
`README.md:6-7`
The Build Status badge links to `actions/workflows/ci.yml/badge.svg`, but CI was split into 11 per-area files; no `ci.yml` exists, so the headline badge is permanently broken.
**Fix:** point the badge at an existing workflow (e.g. `ci-typescript.yml` or `ci-parity.yml`).

---

### Low (31)

**`protocol-3` — Spec omits the normative `desc ≤ 60 UTF-8 byte` cap**
`packages/docs/specification.md:85` — `constants.yml` documents and `parser.ts:288-290` enforces a 60-byte cap as a hard `ERR_INVALID_TXT`, but the spec field table states no limit. **Fix:** add "MUST be ≤ 60 UTF-8 bytes" to the `desc` row; run `pnpm docs:verify` and commit the manifests.

**`aid-3` — `looksLikeAidRecord` over-matches `version=aidN`, which the parser can't consume**
`packages/aid/src/client.ts:74-80` (and `browser.ts:143-147`) — the gate accepts `version=`, but `parseRawRecord` handles only `v`, so `version=aid2;...` is classified AID-like then throws "Missing required field: v" and suppresses the `.well-known` fallback. Linear-time regex (no ReDoS). **Fix:** drop `version` from the gate (preferred) or add a `version` alias; add a test.

**`correctness-1` — Doctor [6/6] line renders "✅ No change" for `binding_loss` while pushing a BINDING_LOSS warning**
`packages/aid-doctor/src/output.ts:140-156` — the downgrade switch has no `binding_loss` case and falls through to a green "No change", contradicting the Summary warning. **Fix:** add a `binding_loss` arm with a warn icon; add a render test.

**`parity-2` (engine-doctor) — Engine `checkDowngrade` never enforces `downgradePolicy=fail` and always persists**
`packages/aid-engine/src/checker.ts:380-460` — engine always writes `cacheEntry=currentEntry`, `exitCode=0`; doctor's `applySecurityState` sets exit 1003 and nulls the cache under `fail`. Latent (no production caller passes `checkDowngrade:true`) but part of the tested public API. **Fix:** remove the dead engine block or make it enforce parity (consolidating with `parity-1` resolves both).

**`docs-mismatch-1` — aid-engine documented "pure, stateless, no side effects" but does network I/O, reads `process.env`, uses `Date.now()`**
`packages/aid-engine/src/index.ts:6-9` — `dnssec.ts:24` fetches, `tls_inspect.ts` opens `tls.connect()`, `checker.ts:286` reads `process.env.AID_SKIP_SECURITY` (an undocumented security side-channel), `:259-260,389` use `new Date()`. **Fix:** reword to reflect reality, document `AID_SKIP_SECURITY`, consider injecting a clock.

**`test-gap-2` (engine-doctor) — Conformance runner doesn't validate `aid-domain` positioning / exact covered-set**
`packages/aid-conformance/src/runner.ts:314-319` — only checks the 4 base components are present and the signature verifies; a mutated vector with `aid-domain` at index 4 still passes. The SDK (`pka.ts:499-524`) enforces exact positioning, so the runner is weaker than the verifier it certifies. **Fix:** add a positional covered-set validator mirroring `validateV2CoveredSet`.

**`correctness-2` — `--code` flag is a no-op on the check/json success path**
`packages/aid-doctor/src/cli.ts:191` (also `:283`) — both commands always `process.exit(report.exitCode)` regardless of `--code`, which only affects the catch path. Scripts relying on "`--code` off ⇒ exit 1" still get 1001/1003. **Fix:** honor `--code` on the report path, or correct the help text; add a test.

**`dead-code-1` — `report.pka.covered` and `createdSkewSec` declared but never populated**
`packages/aid-engine/src/checker.ts:172-182` — both are always null; `performPKAHandshake` returns only `{ domainBound }`. **Fix:** thread `covered[]`/`created` out of the handshake, or remove the fields.

**`go-4` — Well-known fallback reads entire body before the 64KB cap**
`packages/aid-go/fallback.go:35-41` — `io.ReadAll` then check; a malicious host can stream an arbitrarily large body into memory first. **Fix:** `io.ReadAll(io.LimitReader(resp.Body, 64*1024+1))`.

**`go-5` — `isBareIntegerToken` accepts negative `created`/`expires`; TS requires `/^\d+$/`**
`packages/aid-go/parser.go:768-785` — Go accepts a leading `-`; TS rejects at parse time. Low impact (freshness window catches it later) but a grammar divergence. **Fix:** drop the `-` branch; add a negative test.

**`go-6` — `error.go`/`fallback.go` not gofmt-compliant; CI never runs gofmt/vet/lint**
`packages/aid-go/fallback.go:1-70` — both use space indentation; `ci-go.yml` runs only `go test`. **Fix:** `gofmt -w` and add `gofmt -l`, `go vet`, optionally golangci-lint to CI.

**`go-7` — Six shared v2 PKA vectors never driven through the Go handshake**
`packages/aid-go/pka_vectors_test.go:170-194` — `TestPKAVectors` `continue`s on non-aid1; v2 tests cherry-pick IDs, leaving keyid-mismatch, uppercase-alg, duplicate-param, missing-no-store, missing-expires, long-expires, ipv6-authority un-replayed. **Fix:** add a table-driven test looping all v2 vectors and asserting per-vector pass/fail.

**`go-8` — README v2 summary omits the domain-binding covered set and AID-Domain header**
`packages/aid-go/README.md:298-304` — lists only the 4 base components; never mentions `aid-domain;req`, the AID-Domain header, or `DomainBound` despite the feature being implemented and tested. **Fix:** document the domain-bound shape and `DiscoveryResult.DomainBound`.

**`go-9` — README error-code table omits `ERR_FALLBACK_FAILED` (1005)**
`packages/aid-go/README.md:138-147` — 1005 is defined and returned from eight paths but undocumented. **Fix:** add the 1005 row.

**`test-gap-1` (aid-py) — Several shared v2 vectors never exercised in Python (no no-store, v2 keyid-mismatch, freshness, uppercase-alg)**
`packages/aid-py/tests/test_pka_vectors.py:187-737` — only 4 v2 ids referenced; the code paths exist and work (verified manually) but are unasserted; there is specifically no "missing `Cache-Control: no-store`" rejection test. **Fix:** add a v2 vector-replay path through the verifier; at minimum a no-store rejection test.

**`parity-2` (aid-py) — v1 signature base uses `urlparse().netloc` (includes userinfo) where TS uses `URL.host`**
`packages/aid-py/aid_py/pka.py:711` — for URIs with userinfo the two build different signature bases. Legacy v1 only, no shared vector covers it. **Fix:** compute host from hostname+port excluding userinfo.

**`packaging-1` — PyPI metadata missing classifiers**
`packages/aid-py/pyproject.toml:5-17` — no `classifiers`, so the PyPI page advertises no Python versions, license, or status. **Fix:** add MIT license, supported Python minors, `Development Status :: 5 - Production/Stable`, topic classifiers.

**`docs-2` (aid-py) — README claims `[pka]` extra installs PyNaCl, but it only declares cryptography**
`packages/aid-py/README.md:145` — the extra declares only `cryptography>=42`. **Fix:** add `PyNaCl>=1.5` to the extra, or correct the README.

**`robustness-1` — `discover(**kwargs)` silently swallows misspelled security-relevant kwargs (fail-open)**
`packages/aid-py/aid_py/discover.py:87,97-121` — a typo like `well_known_fallbck=False` is ignored and fallback stays enabled (verified). **Fix:** raise `TypeError` on unexpected kwargs.

**`rust-4` — `build_v2_signature_base` returns empty `Vec` instead of erroring on the aid-domain-without-domain branch**
`packages/aid-rs/src/pka.rs:596-602` — TS hard-fails with `ERR_SECURITY` (`pka.ts:617-624`); Rust returns an empty base and relies on a downstream generic verify failure. Weaker defense-in-depth if the line-700 guard is ever reordered. **Fix:** return `Result<Vec<u8>, AidError>` with an explicit error.

**`rust-5` — Rust discovery discards `domainBound` with no in-code note**
`packages/aid-rs/src/discover.rs:135-137` (and `well_known.rs:84-86`) — intentional per the parity plan ("verification-only"), but nothing in source/README documents the deliberate gap. **Fix:** add a comment and a README note; add a `DiscoveryResult` wrapper when surfaced.

**`rust-6` — CI installs rustfmt but never runs clippy or `fmt --check`, and never tests default features**
`.github/workflows/ci-rust.yml:16-36` — formatting unenforced, no clippy, and the default-feature *test* path never runs (so `rust-2`'s silent no-fallback is never test-validated). Stale branch triggers. **Fix:** add `cargo fmt --check` and `cargo clippy -- -D warnings`, run `cargo test --locked` without features, refresh triggers.

**`rust-7` — v2 timestamp parser accepts negative `created`/`expires` that TS rejects**
`packages/aid-rs/src/pka.rs:422-430` — `strip_prefix('-')` accepts negatives; not exploitable (skew check catches it). **Fix:** require all-digits; add a negative-timestamp test.

**`rust-8` — v2 Signature-Input param splitting isn't quote-aware**
`packages/aid-rs/src/pka.rs:379-419` — naive `split(';')` breaks `keyid="a;b"`; not exploitable (real values are token-charset), but a valid-if-unusual input TS accepts could be rejected by Rust. **Fix:** use a quote-aware splitter (like the existing `split_dict_members`) or document the token-charset restriction with a test.

**`dotnet-1` — Sync-over-async: `DiscoverAsync` blocks a thread via `.GetAwaiter().GetResult()`**
`packages/aid-dotnet/src/Discovery.cs:116` (from async `:136`) — blocks on the network PKA handshake; can deadlock under a `SynchronizationContext`. The well-known path correctly awaits the same handshake. **Fix:** make `ParseSingleValid` async and `await ... .ConfigureAwait(false)`.

**`dotnet-3` — Committed cruft: misnamed `dotnet-8-runtime.pkg` (388KB HTML page) and stale `test_results.trx`**
`packages/aid-dotnet/dotnet-8-runtime.pkg` — `file` reports HTML; it's a saved download web page, referenced nowhere. `tests/TestResults/test_results.trx` is a 2025-09-01 artifact from another machine. The package `.gitignore` excludes neither. **Fix:** `git rm` both; add `TestResults/`, `*.trx` (and optionally `*.pkg`) to `.gitignore`.

**`dotnet-4` — Base58 decode produces one extra byte for all-zero (all-`1`) inputs**
`packages/aid-dotnet/src/Base58.cs:20-29` — zero-value sets a one-byte body *and* prepends per leading `1`, yielding N+1 bytes (43 `1`s → 44 bytes, verified). V1-only; the 32-byte length check bounds impact. **Fix:** use an empty body when `n == 0`.

**`dotnet-5` — README claims "No external runtime dependencies" but hard-depends on NSec.Cryptography**
`packages/aid-dotnet/README.md:6` — `AidDiscovery.csproj` has a non-optional `NSec.Cryptography 22.4.0` reference; README line 16 even recommends NSec, contradicting line 6. **Fix:** state the NSec runtime dependency accurately.

**`dotnet-7` — New `HttpClient` + `HttpClientHandler` per network call (socket-exhaustion pattern)**
`packages/aid-dotnet/src/Discovery.cs:46` (also `Handshake.cs:44`, `WellKnown.cs:39`) — per-call construct+dispose leaves connections in TIME_WAIT; a discovery library is called repeatedly. **Fix:** shared static `HttpClient` (or `SocketsHttpHandler` with `PooledConnectionLifetime`) and per-request timeout via a linked CTS.

**`java-4` — `parseV2CoveredItem` omits the unknown-component-name guard TS/Go enforce at parse time**
`packages/aid-java/src/main/java/org/agentcommunity/aid/Handshake.java:584` — Java checks only `;req` and defers name validation to `validateV2CoveredSet` (generic message). Not exploitable, but an error-text/fail-fast divergence. **Fix:** add the name allowlist in `parseV2CoveredItem`; add a test.

**`java-9` — `Discovery.discover()`, `WellKnown.fetch/fetchBound`, and the loopback HTTP relaxation are untested**
`packages/aid-java/src/main/java/org/agentcommunity/aid/WellKnown.java:63` — the public end-to-end path (which contains the `java-1` bug), the content-type/64KB/JSON-object guards, and the narrow loopback relaxation (`:91-104`, a structural divergence from Go) are all unverified. **Fix:** add `HttpServer`-backed tests for `fetchBound` and at least one `discover()` test against a local stub.

**`dry-1` — `isPrivateHost` duplicated verbatim in two files**
`packages/web/src/lib/api/handshake-security.ts:3-8` (identical to `route.ts:185-190`) — a fix to one (e.g. the `ssrf-1` hardening) can miss the other. **Fix:** extract one shared hardened helper.

**`ssrf-4` — OG image route renders unbounded untrusted query params**
`packages/web/src/app/api/og/docs/route.tsx:11-15,65,71,90` — `title`/`description`/`slug` are rendered into satori with no length cap, an unauthenticated CPU-burn vector (distinct query strings bypass the cache). **Fix:** clamp each param (e.g. `title.slice(0,120)`).

**`trav-1` — Dev-only docs fs-fallback joins unsanitized slug into a filesystem path**
`packages/web/src/lib/docs/content.ts:109-122` — `path.join(docsDir, ...)` with only slash-trimming, no `..` stripping. Production Workers use the JSON index (no fs), and Next normalizes most `..`, so exploitability is very low. **Fix:** reject `..`/separators or assert the resolved path stays within `docsDir`.

**`handshake-ssrf-1`** — duplicate of `ssrf-1` from the web-ui stream; same `route.ts:185-190` gaps plus an explicit DNS-rebinding note. **Fix:** centralize one hardened check and, where feasible, resolve the hostname and re-check the resolved IP.

**`use-connection-dead-1` — Dead `useConnection()` hook carries a latent guidance/agentCard bug**
`packages/web/src/hooks/use-connection.ts:86-144` — handles only `raw.success && raw.data`, so it would mislabel every non-MCP protocol (which return `agentCard`/`guidance` at top level) as a failed handshake. Zero callers; the live path is `LiveDatasource.handshake`. **Fix:** delete the hook (keep `AuthRequiredError` and types) or mirror the datasource's guidance-first branch.

**`pka-demo-failclosed-test-gap-1` — Missing test for pka-demo "covers aid-domain but no AID-Domain header"**
`packages/web/src/app/api/pka-demo/route.ts:50-62,116-124` — the route signs unbound in that case; acceptable for a demo (fail-closed lives in the SDK verifier) but untested/unspecified. **Fix:** add a test pinning the behavior (or return 400 as the cleaner fail-closed mirror).

**`docs-1` (docs-spec) — PKA expanded as "Public Key Attestation" in 4 docs, contradicting the glossary's "Public Key for Agent"**
`concepts.md:120`, `versioning.md:54`, `security.md:154`, `faq.md:46` — the spec glossary (`specification.md:43`) and 3 other docs use "Public Key for Agent". **Fix:** replace "Public Key Attestation" in all four; run `pnpm docs:verify`.

**`docs-2` (docs-spec) — troubleshooting.md lists only 4 of 9 protocol tokens for `ERR_UNSUPPORTED_PROTO`**
`packages/docs/Reference/troubleshooting.md:31` — says "Use one of: mcp, openapi, a2a, local" (stale v1.0-era); v2 has 9 tokens. **Fix:** list all 9 or point to the registry.

**`docs-3` (docs-spec) — pka.md base "Rejection Checklist" contradicts the later Domain Binding section with no forward reference**
`packages/docs/Reference/pka.md:130-131` — base checklist says "covered components differ from the AID profile" (4 components) while the Domain Binding section legitimately allows 5. A reader following the base checklist literally would reject a valid bound proof. **Fix:** add a "unless the optional domain-binding component is present; see Domain Binding Profile below" caveat, mirroring spec B.6 item 3.

**`docs-engine-1` — aid-engine doc uses `validation.errors` but the function returns `{ isValid, error }`**
`packages/docs/Tooling/aid_engine.md:73-75` — singular `error`, not an `errors` array; `validation.errors` is always undefined. **Fix:** log `validation.error`.

**`docs-doctor-1` — aid-doctor doc overstates `pka generate` output (claims it prints the derived keyid)**
`packages/docs/Tooling/aid_doctor.md:117` — `pka generate` (`cli.ts:360-366`) prints only the public key; the thumbprint is derived elsewhere during a check. **Fix:** correct the sentence.

**`docs-engine-3` — aid-engine doc `DoctorReport` type drifts (cacheEntry optionality, field order)**
`packages/docs/Tooling/aid_engine.md:93-104` — documents `cacheEntry?` (optional) but the real type is `cacheEntry: CacheEntry | null` (required, nullable). **Fix:** update the documented interface or mark it abridged.

**`docs-java-dotnet-1` — Java and .NET quickstarts have no install/dependency instructions**
`packages/docs/quickstart/quickstart_java.md:1-44` (and dotnet) — no Maven/NuGet coordinates, likely because the SDKs aren't published. Flagged as a coverage gap, not a fabricated command. **Fix:** add a "consumed from source / not yet published" note now; add real coordinates when published.

**`ci-9` — Go toolchain version inconsistent across CI and below `go.mod` in the parity job**
`.github/workflows/ci-parity.yml:33-35` — `go.mod` requires `go 1.23.0`/`toolchain go1.24.4`; ci-go provisions 1.23, ci-parity provisions 1.22 (can't satisfy the module without an implicit toolchain download → non-hermetic). **Fix:** align all `setup-go` versions, or use `go-version-file: packages/aid-go/go.mod`.

**`ci-10` — SBOM generated with a Node-only tool for all six languages → five mislabeled SBOMs**
`.github/workflows/security.yml:104-113` — every leg runs a node_modules-only generator and uploads `sbom-go.xml`/`sbom-rust.xml`/etc., all describing the npm tree. **Fix:** generate the npm SBOM once and use ecosystem-appropriate tools for the others.

**`ci-12` — `actions-rs/toolchain` is archived/unmaintained (deprecated Node runtimes)**
`.github/workflows/ci-rust.yml:17` — a latent CI break. **Fix:** replace with `dtolnay/rust-toolchain@stable`.

**`ci-13` — `prepare` uses deprecated `husky install`**
`package.json:48` — husky 9.1.7 prints a deprecation warning and the command is removed in v10. **Fix:** change to `"prepare": "husky"`.

**`docs-3` (misc-md) — AGENTS.md references `WORKBENCH_COMPONENTS.md` but the file is `WORKBENCH_COMPONENTS_2.md`**
`AGENTS.md:12,39` — broken intra-repo link in the declared source of truth. **Fix:** update both references (or rename the file).

**`docs-4` (misc-md) — README links to `./CODE_OF_CONDUCT.md`, which doesn't exist**
`README.md:350` — 404 for anyone browsing the repo. **Fix:** add the file/stub or link the org-wide policy CONTRIBUTING.md already references.

**`docs-5` (misc-md) — Three published-package READMEs use the wrong org slug `agent-community` (hyphenated)**
`packages/aid/README.md:17` (also `aid-doctor/README.md:17`, `aid-conformance/README.md:17`) — the real org is `agentcommunity`; the hyphenated URL 404s and is bundled into npm tarballs. **Fix:** replace `agent-community` with `agentcommunity`; add a grep guard.

**`parity-1` (misc-md) — Non-TS SDK READMEs omit domain binding entirely despite all implementing it**
`packages/aid-go/README.md:298-308` (and aid-rs/aid-py/aid-dotnet/aid-java) — only the TS README and top-level docs cover it; aid-go and aid-rs explicitly enumerate the v2 covered set as *only* the 4 base components. The docs under-describe their own behavior. **Fix:** add a short domain-binding note to each non-TS README; fix the aid-go/aid-rs "covered fields set" lines.

**`test-gap-1` (misc-md) — pka_e2e loopback suite has no negative domain-binding path**
`packages/e2e-tests/src/pka_e2e.ts:229-297` — only the PASS path is exercised; no e2e case for fail-closed rejection, domain-mismatch, or `--domain-binding require` against an unbound proof. The one-tag handshake's most security-relevant behavior is unverified at the CLI/integration layer. **Fix:** add loopback negative cases asserting non-zero exit.

**`test-gap-2` (misc-md) — Conformance runner doesn't assert `aid-domain` coverage for domain-bound pass vectors**
`packages/aid-conformance/src/runner.ts:314-420` — uses a subset check, so it never asserts the bound vector actually covers `aid-domain;req` at index 3, nor the base-4-or-base-5 length rule; it relies purely on Ed25519 verification to fail the mismatch vector. A regression dropping `aid-domain` while keeping a verifying signature would pass. **Fix:** when a vector carries a top-level `domain`, assert `aid-domain;req` at index 3 and the length rule.

---

### Info (7)

**`protocol-4` — Generated constants emit `ERROR_MESSAGES` only for TS/Python/Go; Rust/.NET/Java drop them**
`scripts/generate-constants.ts:607-720` — numeric codes are in sync across all six; the human-readable `description` strings are silently not propagated to Rust/.NET/Java. Intentional but undocumented. **Fix:** extend those generators to emit a message map, or add a comment documenting the intentional asymmetry.

**`aid-5` — Dead commented-out `canonicalizeRaw` block in client.ts**
`packages/aid/src/client.ts:85-111` — ~26 stale lines duplicating the canonical `parser.ts` implementation. **Fix:** delete the block.

**`build-ci-1` — `aid-conformance` lists `LICENSE` in `files[]` but no per-package LICENSE exists**
`packages/aid-conformance/package.json:43-47` — repo-wide pattern (aid, aid-doctor too); npm pack warns and ships no license. **Fix:** add per-package LICENSE (or copy root at build) or remove from `files[]`.

**`style-1` — `DNS_TTL_DEFAULT` defined after its only use**
`packages/aid-py/aid_py/discover.py:69,77` — functionally correct (module global) but confusing, and a second hard-coded `300` that can drift from imported `DNS_TTL_MIN`. **Fix:** move it above the function or reuse `DNS_TTL_MIN`.

**`rust-9` — `AidRecordV1` is a field-for-field duplicate of `AidRecord`**
`packages/aid-rs/src/record.rs:14-37` — `as_v1()` clones into a structurally identical type with no added type safety. Benign. **Fix:** return a borrowed view, remove `AidRecordV1`, or add a doc note.

**`rust-10` — `canonicalize_aid_domain` has no direct unit test**
`packages/aid-rs/src/pka.rs:89-103` — a security-relevant normalizer (bound into the signed AID-Domain line) exercised only indirectly via already-canonical vectors. **Fix:** add unit tests for trailing-dot stripping, uppercase folding, empty rejection, invalid-charset rejection.

**`dotnet-6` — Public async API exposes no `CancellationToken`**
`packages/aid-dotnet/src/Discovery.cs:123` (also `Handshake.cs:177`, `WellKnown.cs:35`) — non-idiomatic; callers can't cooperatively cancel before timeout. **Fix:** add `CancellationToken cancellationToken = default` and thread it through.

**`dotnet-9` — Well-known fallback doesn't enforce `dep` expiry, unlike TS**
`packages/aid-dotnet/src/WellKnown.cs:35-77` — validates `dep` format but not expiry; consistent with the minimal-SDK scope. **Fix:** decide explicitly whether dep-expiry is part of the cross-SDK contract; document or implement.

**`java-11` — jacoco applied but no report/gate wired in**
`packages/aid-java/build.gradle:3` — no `jacocoTestReport`/`Verification`/`check.dependsOn`; combined with CI running only `HandshakeTest`, it implies coverage tracking that doesn't exist. **Fix:** wire a real report/gate or remove the plugin.

**`pka-demo-spec-link-1` — pka-demo JSON `spec` link uses the wrong docs base**
`packages/web/src/app/api/pka-demo/route.ts:90` — points at `docs.agentcommunity.org/docs/reference/pka`; the convention elsewhere is `docs.agentcommunity.org/aid/...` (live host `aid.agentcommunity.org/docs/...`). Likely a dead link. **Fix:** point at the canonical published URL and verify it 200s.

**`docs-a2a-1` — A2A quickstart snippet uses `any`, which the style guide bans**
`packages/docs/quickstart/quickstart_a2a.md:50` — `{ [scheme: string]: any }` in illustrative TS. **Fix:** use `Record<string, unknown>`.

**`ci-15` — `setup-python`/`setup-go`/`checkout`/`cache` action majors drift across workflows (some on EOL Node 16)**
`.github/workflows/ci-python.yml:17` — e.g. setup-python@v4 vs @v5, checkout@v6 in showcase-dns only. **Fix:** standardize one major per action.

**`ci-16` — Workflow triggers reference stale feature branches**
`.github/workflows/ci-typescript.yml:5-7` — `feat/aid1.1-spec`, `feat/next16-react19-modernization` no longer exist. **Fix:** trim to currently-relevant branches.

**`ci-17` — Three overlapping changesets give contradictory "optional profile" vs "default" framing**
`.changeset/pka-domain-binding.md:7` vs `domain-binding-baseline.md` — same release, same packages, opposite framing. Wire facts are consistent; only the narrative conflicts. **Fix:** consolidate into one coherent entry before `changeset version`.

**`ci-18` — docs-authority canonical PKA check validates only the unbound vector**
`scripts/docs-check.mjs:349-468` — no structural validation of the two domain-bound vectors. **Fix:** also assert the bound vector's covered set (base-4 + `aid-domain;req` at index 3, tag `aid-pka-v2`, expected pass) and the mismatch vector's expected fail.

**`info-1` — sdk-parity changeset bumps `@agentcommunity/aid` though the parity work touched only non-TS SDKs**
`.changeset/sdk-parity-domain-binding.md:1-9` — defensible (Changesets only versions JS packages) but potentially confusing. **Fix (optional):** note in the changeset body that the bump is a no-op marker for the JS package.

---

## 3. Disputed / Needs-Human-Judgment

**None.** All 92 findings survived adversarial verification with `status: confirmed`; the data contains zero disputed items. Separately, **18 candidate findings were dismissed** by the verifiers before this report (not enumerated in the dataset). A few confirmed findings carry an explicit "intentional but undocumented" judgment that a maintainer should ratify rather than silently fix:

- `rust-5` (Rust drops `domainBound` — deliberate "verification-only" parity per the plan; needs a doc note, not a behavior change).
- `dotnet-9` (no `dep`-expiry enforcement — likely intentional scope reduction; confirm whether dep-expiry is in the cross-SDK contract).
- `protocol-4` and `info-1` (intentional generator/changeset asymmetries; confirm and document).
- `docs-java-dotnet-1` (missing install instructions — correct *because* the SDKs aren't published; revisit on publish).

---

## 4. Coverage Manifest

**Distinct files reviewed: 354.** The review reached deep, verified coverage of the protocol core, all six SDKs' parser/PKA paths, the conformance harness, CI/release workflows, and the docs corpus. It is **not yet 100%** — the completeness critics identified specific blind spots, the most consequential of which is a live user-facing doc that no reviewer opened.

### Completeness critics' gaps (must-look to close)

| ID | Area | Severity | What was missed |
|----|------|----------|-----------------|
| — | **`packages/docs/specification_v2_explained.md`** (33KB, renders live at `/docs`) | **High** | Opened by **zero** of 15 reviewers. Predates domain binding (modified 2026-06-08 vs spec rewrite 2026-06-14). §3.2 threat model has no unauthorized-association entry; §3.3 omits `domain-binding=off\|prefer\|require`; Appendix B stops at B.6 with a 4-component-only covered set (no AID-Domain, no `aid-domain;req`, no `domainBound`). **Directly contradicts the normative spec and all six SDKs and is shipped to users.** Bring §3.2/§3.3/Appendix B in line with `specification.md:491-526`, then `pnpm docs:verify`. |
| g3 | Streams with empty coverage notes | **High** | 7 of 15 streams reported empty `coverageNotes`; ~98 web files were never opened. Backfill web-api/web-ui/parity/ci-release. |
| g1 | `web/src/spec-adapters/v1.ts` `isCap` | Medium | Precedence bug: `isCap(null)` throws `TypeError`; a malformed resource cap passes; `normalizeHandshake` crashes on a null capability (reproduced). Move the resource branch inside the null guard; test a null entry. |
| g2 | Triple builders (`generator/core.ts`, `aid-generator.ts`, engine `generator.ts`) | Medium | Three independent TXT-record validators; drift risk. Diff vs engine/parser and unify. |
| g4 | `components/ui/pka-key-generator.tsx` | Medium | Mints Ed25519 keys in-browser; unreviewed crypto UI. Confirm `getRandomValues` and no key leak. |
| g5 | `api/og/docs/route.tsx` | Low | (Also surfaced as confirmed `ssrf-4`.) Clamp inputs. |
| — | `specification_v2_explained.md` nav wiring | Low | In the export manifest + docs-index (renders at a direct URL) but referenced in no `meta.json`. Confirm whether it's an intentional unlisted draft or an accidental nav omission. |
| — | `protocol/pka_vectors.json` `version` field | Low | Still `"version": 1` after the db vectors were added. Grep all six loaders to see if any consumer keys off it; bump to 2 or document as informational. |
| — | `aid-engine/tsup.config.bundled_*.mjs` (×2) | Low | Tracked build cruft (committed in PR #65); no `.gitignore` rule covers `tsup.config.bundled_*`. `git rm` and ignore. |
| — | Root/web build + lint config cluster | Low | `pnpm-workspace.yaml`, `tsconfig.base.json`, eslint/tsup/vitest configs were out of scope. Low drift risk for the PKA refactor, but confirm `pnpm-workspace.yaml` covers all 11 packages and `tsconfig.base.json` carries the mandated strict/`exactOptionalPropertyTypes` flags. |

### Unreviewed files (54)

Notable unopened files beyond the gaps above: `web/src/lib/generator/core.ts`, `web/src/lib/aid-generator.ts`, `web/src/spec-adapters/v1.ts`, `web/src/components/ui/pka-key-generator.tsx`, `web/src/hooks/chat-engine/reducer.ts`, `packages/docs/index.md`, `scripts/docs-check.mjs` / `docs-export.mjs` / `generate-examples.ts`, `showcase/terraform/examples.tf`, all package `CHANGELOG.md` files, and the `.github/*.md` + `tracking/**` doc set. The full 54-path list is in the source data.

### Statement on coverage

**Coverage is high but not complete.** To truthfully claim full coverage, three items deserve a real pass before sign-off: (1) **`specification_v2_explained.md`** — the only confirmed high-severity content gap that ships to users and contradicts the spec; (2) the **g1 `isCap` null-crash** and **g4 in-browser key generator**, both reproducible/security-adjacent; and (3) the **~98 unopened web files / 7 empty-coverage streams (g3)**, which is where remaining unknown bugs are most likely to hide. Everything else on the unreviewed list is low-drift config or tracking docs that can be confirmed quickly.

---

## 5. Themes

1. **Cross-language parity drift is the dominant pattern.** The TS reference is the de-facto spec; Go, Python, Rust, .NET, and Java each diverge in specific, verified ways — Go panics/accepts-duplicates/accepts-negatives, TS over-accepts prototype tokens, Python mutates the record dict, Rust silently drops fallback/`domainBound`, .NET miscounts Base58, Java mislocates the deprecation check and corrupts the DoH name. The root enabler is a **shared harness that can't enforce parity**: `golden.json` lacks the relevant invalid fixtures and the conformance runner only ever drives the TS parser (`parity-4`). Fixing the harness first would surface and prevent most of these.

2. **Green CI that enforces nothing.** A striking number of gates pass while verifying little: Java CI runs only an unrelated synthetic test (`java-7`), the conformance gate checks `total>0` not `failed===0` (`protocol-1`), the macOS doctor matrix only compiles (`ci-6`), the license check samples 10 files and never fails (`ci-8`), PyPI publish is unconditional (`ci-3`), and Rust/Go CI skip clippy/fmt/vet (`rust-6`, `go-6`). Several real bugs (the critical Java DoH bug included) survive precisely because of this. The highest-leverage remediation is to make existing gates actually assert and to add the missing negative/e2e tests they imply.

3. **Documentation has drifted behind a v2 + domain-binding refactor.** First-copy quickstart examples throw or don't compile in Python, Go, and Rust; READMEs document non-existent APIs and wrong signatures; the PKA acronym, protocol-token lists, and covered-set rules contradict the authoritative spec across files; and the v2 explainer (the one truly missed doc) still describes a pre-domain-binding world. Wiring READMEs into compiled doctests (Rust/TS) and tightening the docs-authority gate (`ci-18`) would catch the API-drift class automatically.

4. **The web handshake proxy is the real security surface, defended mostly by a platform flag.** The SSRF blocklist misses cloud metadata, IPv6, and most of loopback (`ssrf-1`/`handshake-ssrf-1`), redirects bypass even that check (`ssrf-2`), the probe has no timeout (`ssrf-3`), and the guard is duplicated so a fix can miss a copy (`dry-1`) — with zero route-level tests (`test-1`). In production the Cloudflare `global_fetch_strictly_public` flag is the actual saving grace; the app-level defense, which is the only control on the Node/self-hosted path, should be hardened and tested so the platform flag is defense-in-depth rather than the sole barrier.

5. **No surviving `aid-pka-v2-db` tag references.** The recent one-tag unification appears clean: the data contains no finding flagging a stale `aid-pka-v2-db` tag in code or shipped docs (the only residue is vector IDs and tracking history, which are explicitly allowed). The domain-binding *behavior* is well-implemented across all six SDKs; the gaps are in **test coverage of the fail-closed path** (`java-3`, `dotnet-2`, `rust-3`, the e2e and conformance gaps) and **documentation of it** (non-TS READMEs, the v2 explainer) — not in the wire contract itself.

---

## Appendix A — All confirmed findings (structured)

| Sev | ID | Category | Location | Issue | Fix |
|---|---|---|---|---|---|
| 🔴 Critical | java-1 | correctness | `packages/aid-java/src/main/java/org/agentcommunity/aid/Discovery.java:101` | DoH query name is corrupted: substring(3) strips the leading slash plus the first two characters of every FQDN | Change `.substring(3)` to `.substring(1)`, or better, percent-encode the fqdn with `URLEncoder`/a dedicated helper and add a unit test asserting the exact DoH URL for `_agent.example.com` and `_agent._mcp.example.com`. Mirror Go/TS which resolve TXT via the native resolver and never mangle the name. |
| 🟠 High | go-1 | correctness | `packages/aid-go/parser.go:24-26` | parseRaw panics on malformed TXT pair instead of returning ERR_INVALID_TXT (DoS on attacker-controlled DNS) | Replace the panic with a typed error: change parseRaw to return (map[string]string, error) and emit newAidError("ERR_INVALID_TXT", "Invalid key-value pair: "+p) for segments without '=' (matching TS). Update Parse to propagate it. Add a golden/negative test for a bare-token TXT record. |
| 🟠 High | ssrf-1 | security | `packages/web/src/app/api/handshake/route.ts:185-190 (also duplicated in packages/web/src/lib/api/handshake-security.ts:3-8)` | isPrivateHost SSRF blocklist misses cloud-metadata, IPv6, full loopback range, and 0.0.0.0 | Block link-local 169.254.0.0/16 (and IPv6 fe80::/10), the full 127.0.0.0/8 loopback range, 0.0.0.0, IPv6 loopback ::1, IPv6 ULA fc00::/7, and IPv4-mapped IPv6 (::ffff:x). Normalize/parse the host as an IP (handle bracketed IPv6 from url.hostname) rather than string-prefix matching. Keep relying on global_fetch_strictly_public as defense-in-depth, not the sole control. Consolidate the two duplicated copies (see dead-code/dry finding) so the hardening applies in both places. |
| 🟠 High | docs-py-1 | docs-mismatch | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/docs/quickstart/quickstart_python.md:21-24` | Python quickstart first example uses object access (result.record.proto / result.ttl) but discover() returns a (dict, int) tuple | Rewrite the first example to match the real API: `record, ttl = discover("supabase.agentcommunity.org")` then `print(record["proto"], record["uri"], record.get("desc"), ttl)`. Use `record.get("domain_bound")` for the PKA indicator. Fix the identical pattern in packages/aid-py/README.md:25-28 too. |
| 🟠 High | docs-go-1 | docs-mismatch | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/docs/quickstart/quickstart_go.md:12, 25` | Go quickstart install + import path does not match the module declared in go.mod | Reconcile the docs with go.mod. Either update the docs (quickstart + README) to `github.com/agentcommunity/aid-go`, or, if the long vanity path is intended, change go.mod's module line and the package layout accordingly. The two must agree or `go get` fails. |
| 🟠 High | docs-index-1 | docs-mismatch | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/docs/quickstart/index.md:25-30` | Quickstart index 'Publish An Agent' uses non-existent aid-doctor generate flags (--uri/--proto/--desc) | Either show the interactive form (`aid-doctor generate`, optionally `--save-draft <path>`) and present the TXT value as wizard output, or add non-interactive `--uri/--proto/--desc` flags to the generate command if a scriptable mode is desired. As written the documented command errors out. |
| 🟠 High | parity-2 | correctness | `packages/aid-go/parser.go:25` | Go parser panics on a malformed TXT pair (no `=`) instead of returning ERR_INVALID_TXT | Make `parseRaw` return `(map[string]string, error)` and return `newAidError("ERR_INVALID_TXT", fmt.Sprintf("Invalid key-value pair: %s", p))` instead of panicking; propagate through `Parse`. Add a golden/parity invalid fixture (e.g. `raw: "v=aid2;garbage;u=https://x/mcp;p=mcp"`, `errorCode: ERR_INVALID_TXT`) so all SDKs are checked. |
| 🟠 High | ci-3 | build-ci | `.github/workflows/release.yml:55-65` | PyPI publish step is unconditional and has no skip-existing guard; npm-only releases will fail on duplicate version | Add `skip-existing: true` to the pypa publish step, or gate the entire 'Build/Publish Python' block on a detected version change in packages/aid-py/pyproject.toml (e.g. only run when the release commit touched aid-py). Ideally split npm and PyPI into independent jobs so one registry's no-op cannot fail the other. |
| 🟡 Medium | protocol-1 | test-gap | `packages/aid-conformance/src/runner.test.ts:24-32` | Conformance runner CI gate does not assert real PKA vectors pass (only total>0), so a regressed vector can slip through aid-conformance CI | In runner.test.ts:24, also assert `expect(result.categories.pkaVectors.failed).toBe(0)` (and ideally the same for records/recordSets/enterprisePolicies), OR add an `aid-conformance` package.json script that runs the runner CLI against the real fixtures and wire it into ci-typescript.yml so the non-zero exit code gates CI. |
| 🟡 Medium | aid-1 | security | `packages/aid/src/parser.ts:279, 284` | Protocol/auth token validation uses `in` operator, accepting Object.prototype members (validation bypass + parity divergence) | Use own-property membership instead of `in`. Replace with `Object.prototype.hasOwnProperty.call(PROTOCOL_TOKENS, protoValue)` (and same for AUTH_TOKENS), or convert PROTOCOL_TOKENS/AUTH_TOKENS/LOCAL_URI_SCHEMES checks to `Set`-based lookups, or build the constant objects with `Object.create(null)`. Apply the same fix to `isValidProto`. Add negative tests for proto/auth values `constructor`, `toString`, `hasOwnProperty`, `__proto__`, `valueOf` asserting ERR_UNSUPPORTED_PROTO / 'Invalid auth token', and add them to the shared parity vectors so all six SDKs are checked. |
| 🟡 Medium | aid-2 | security | `packages/aid/src/pka.ts:579 (V2), 245 (V1)` | Malformed PKA Signature value throws a raw DOMException, not AidError — fail-open downgrade to .well-known on a failed endpoint proof | Wrap the response-signature base64 decode (and ideally the whole parseV1/parseV2SignatureHeaders body) so any decode failure throws AidError('ERR_SECURITY', 'Invalid PKA signature encoding'). Simplest: add a guarded `decodeSignatureBytes()` that try/catches atob and rethrows AidError, used by both V1 and V2. Add negative tests asserting performPKAHandshake rejects with errorCode ERR_SECURITY on a malformed Signature value, and an integration test asserting discover() does NOT fall back to .well-known when the DNS-record PKA proof fails. |
| 🟡 Medium | aid-4 | test-gap | `packages/aid/src/pka.v2.test.ts:n/a (suite-wide)` | No negative-path test coverage for malformed PKA signature encoding or prototype-chain proto/auth tokens | Add: (a) a pka.v2 test mutating vector.response.signature to a non-base64 string and asserting rejects with errorCode ERR_SECURITY; the V1 equivalent in pka.vectors/client.pka.integration; (b) parser tests asserting proto/auth values constructor/toString/hasOwnProperty/__proto__/valueOf are rejected. Promote both to the shared protocol vectors for cross-SDK parity. |
| 🟡 Medium | parity-1 | parity | `packages/aid-doctor/src/cache.ts:196-197` | classifySecurityChange diverges between engine and doctor — doctor false-positives key_replaced when previous entry has pka but no keyid | Make the doctor's key extraction identical to the engine's: `previous.keyid ?? derivePkaKeyid(previous.pka)?.keyid ?? previous.pka` (and same for current). Better: extract a single shared classifySecurityChange into aid-engine and have the doctor cache re-export it, eliminating the duplicate entirely. Add a cross-package test that feeds identical CacheEntry pairs through both and asserts equal results, including the pka-set/keyid-null case. |
| 🟡 Medium | test-gap-1 | test-gap | `packages/aid-conformance/src/index.test.ts:48-67` | Conformance suite does not assert the two domain-binding vectors exist or are correctly classified | Add both db vector IDs to the index.test.ts arrayContaining assertion and add a runner.test.ts case asserting the pass vector classifies pass and the mismatch vector classifies fail (the cross-domain forgery rejection is the core security property of the one-tag domain-binding contract). |
| 🟡 Medium | go-2 | parity | `packages/aid-go/parser.go:15-32` | Duplicate TXT keys are silently accepted (last-write-wins) instead of rejected | After computing key, reject duplicates (`if _, exists := record[key]; exists { return error ERR_INVALID_TXT 'Duplicate key' }`) and reject empty key or empty value, matching parser.ts:131-137. Add parity fixtures for duplicate-key and empty-value TXT records to test-fixtures/golden.json invalid set. |
| 🟡 Medium | go-3 | docs-mismatch | `packages/aid-go/README.md:60-73` | README documents wrong DiscoverWithOptions signature; example does not compile | Update the README heading and example to `res, err := aid.DiscoverWithOptions(...)` returning DiscoveryResult{Record, TTL, DomainBound}, and document the DomainBound field. Also update the AidRecord struct doc (README.md:108-116) which omits Docs/Dep/Pka/Kid fields that exist on the real struct. |
| 🟡 Medium | docs-1 | docs-mismatch | `packages/aid-py/README.md:18-32, 36, 48-50, 84-89` | README API reference is entirely wrong: documents a DiscoveryResult object, code returns a (dict, int) tuple | Rewrite the README Quick Start, Returns, and Data Types sections to reflect the real `(record_dict, ttl)` tuple return and dict-key access (`record['proto']`), or introduce an actual `DiscoveryResult` dataclass and return it. Other SDKs (Go `DiscoveryResult{Record,TTL,DomainBound}`) use a struct; aligning Python to a small result object would also fix the parity gap in finding parity-1. |
| 🟡 Medium | parity-1 | parity | `packages/aid-py/aid_py/discover.py:152-153, 247-248` | domain_bound surfaced by mutating the AidRecord dict instead of a separate result field (parity + type-safety divergence) | Surface domain binding via the result rather than the record, e.g. return a small `DiscoveryResult`/named-tuple with a `domain_bound` field (matching Go/TS), or at minimum add `domain_bound` to the `AidRecord` TypedDict so the off-schema key is typed. Keeping it inside the spec record dict is the divergence to fix. |
| 🟡 Medium | rust-1 | docs-mismatch | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/aid-rs/README.md:101` | README v2 handshake example calls perform_pka_handshake with 4 args but signature requires 5 (will not compile) | Update the example to pass the 5th argument, e.g. `perform_pka_handshake(&rec.uri, rec.pka.as_deref().unwrap(), "", std::time::Duration::from_secs(2), Some("example.com")).await?;` (or `None`). Consider wiring the README as a compiled doctest (`#![doc = include_str!("../README.md")]`) so these examples are checked by CI. |
| 🟡 Medium | rust-2 | build-ci | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/aid-rs/src/discover.rs:150-155` | Well-known fallback is silently compiled out under default features; DiscoveryOptions.well_known_fallback is ignored unless `handshake` is enabled | Either keep `fetch_well_known` always compiled (move the HTTP fetch out of the handshake gate, gating only the PKA verification it performs), or fail-loud: when `well_known_fallback` is requested but the feature is disabled, return an explicit error rather than silently skipping. At minimum, document that well-known fallback requires the `handshake` feature in the README and the `discover` doc comment. |
| 🟡 Medium | rust-3 | test-gap | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/aid-rs/src/pka.rs:628-710` | No end-to-end test exercises the v2 PKA handshake; the one-tag fail-closed security invariant is untested | Add httpmock-based tests for `perform_v2_pka_handshake_with_controls` using the `v2_nonce`/`now_epoch_seconds` controls: (1) a happy-path domain-bound handshake that asserts the `AID-Domain` request header is sent and returns `Ok(true)`; (2) a fail-closed test where the server returns an aid-domain-covering signature but the client sent no domain, asserting the line 700-702 rejection; (3) missing `Cache-Control: no-store`; (4) nonce/tag/keyid mismatch; (5) redirect rejection. |
| 🟡 Medium | dotnet-2 | test-gap | `packages/aid-dotnet/tests/PkaTests.cs:n/a (missing tests)` | Domain-binding negative paths untested: fail-closed rejection, unbound domainBound=false, and AID-Domain canonicalization have zero coverage | Add three tests mirroring TS: (1) send no domain, return a response whose Signature-Input covers aid-domain (re-signed), assert ERR_SECURITY 'Response covers aid-domain but no AID-Domain was sent'; (2) send a domain but return the plain 4-component v2 response, assert PerformHandshakeAsync returns false; (3) unit-test CanonicalizeAidDomain via a domain like 'bad domain' and '' asserting ERR_SECURITY (expose internal or test via handshake). |
| 🟡 Medium | java-3 | test-gap | `packages/aid-java/src/test/java/org/agentcommunity/aid/AidV2Test.java:773` | No fail-closed negative test: response covering aid-domain with no AID-Domain sent is never asserted to be rejected | Add a test that loads v2-db-rfc9421-domain-bound and calls the 6-arg verifyV2Response (no domain), asserting ERR_SECURITY with message containing "no AID-Domain was sent". This locks in the fail-closed contract at parity with Go/TS. |
| 🟡 Medium | java-5 | test-gap | `packages/aid-java/src/main/java/org/agentcommunity/aid/Handshake.java:330` | verifyV2Response test overloads discard the domainBound return value; no test asserts the bound/unbound result | Have the test overloads return the boolean (or add a returning variant) and assert `assertTrue(domainBound)` for v2-db-rfc9421-domain-bound and `assertFalse(domainBound)` for v2-rfc9421-response-signature, matching Go/TS. |
| 🟡 Medium | java-6 | test-gap | `packages/aid-java/src/main/java/org/agentcommunity/aid/Handshake.java:216` | Entire V1 PKA handshake path (AID-Challenge / signed Date / base58 key) is untested in Java | Add a data-driven test that loads the aid1 vectors from protocol/pka_vectors.json and drives performV1Handshake (via a local HttpServer like assertRepeatedAidPkaHeaderRejected) for pass/fail, plus a direct Base58.decode round-trip/edge test (leading zeros, empty, invalid char). |
| 🟡 Medium | java-7 | dead-code | `packages/aid-java/src/test/java/org/agentcommunity/aid/HandshakeTest.java:18` | HandshakeTest plus src/test/resources/vectors.json are misleading dead test code that exercise no production class | Either delete HandshakeTest + its vectors.json, or rewrite it to drive the real Handshake against the shared protocol/pka_vectors.json. At minimum stop relying on it as the CI signal. |
| 🟡 Medium | ssrf-2 | security | `packages/web/src/lib/protocols/handlers/a2a.ts:28-34` | A2A agent-card fetch follows redirects, bypassing the isPrivateHost pre-check | Set redirect: 'manual' on the A2A card fetch (and any other server-side discovery fetch), and re-run the SSRF host check on any redirect Location before following, or refuse redirects outright for discovery fetches. Apply the same pattern to the MCP SDK transport if it follows redirects internally. |
| 🟡 Medium | ssrf-3 | security | `packages/web/src/app/api/handshake/route.ts:94` | Handshake MCP HEAD probe has no timeout — unbounded server-side fetch | Add signal: AbortSignal.timeout(<small ms, e.g. 3000>) to the HEAD probe so a hostile or slow endpoint cannot pin the request. |
| 🟡 Medium | test-1 | test-gap | `packages/web/src/app/api/handshake/route.ts:51-180` | Handshake POST route has zero direct test coverage (SSRF block, scheme branch, auth mapping all untested) | Add route-level tests POSTing to the handler: assert 400 'Target host not allowed' for private/link-local/IPv6/loopback hosts (lock in the ssrf-1 hardening), 400 'Invalid JSON body', 401 unsupported-scheme, and the needsAuth mapping. Rename handshake-route-security.test.ts or move its getSecurityInfo cases, since it does not test the route. |
| 🟡 Medium | docs-toc-1 | correctness | `packages/web/src/lib/docs/content.ts:70-90 (slugify/extractHeadings); also packages/web/scripts/generate-docs-index.ts:78-101` | Docs TOC links/scroll-spy break: index slug ids diverge from rehype-slug DOM ids (40 headings affected) | Generate heading ids with the same algorithm rehype-slug uses (github-slugger) in generate-docs-index.ts/content.ts, instantiating one slugger per document so duplicate headings dedupe identically. Alternatively drop rehype-slug and feed the precomputed ids into the headings via a rehype plugin so the two sources cannot drift. Add a test that, for each doc, every `heading.id` resolves against the github-slugger output. |
| 🟡 Medium | wellknown-aid1-1 | docs-mismatch | `packages/web/src/app/.well-known/agent/route.ts:13-19` | Self-hosted .well-known/agent dogfood still serves legacy v=aid1 while the project is v2-normative | Update the dogfood well-known JSON to `v: 'aid2'` and the current key set (consider adding `k` for the published pka-basic key so it round-trips through the v2 handshake). Add a small test asserting the served record parses as aid2 to prevent regression. |
| 🟡 Medium | docs-py-2 | docs-mismatch | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/docs/quickstart/quickstart_python.md:53-55` | Python quickstart parse() example uses attribute access rec.uri but parse() returns a dict | Change `print(rec.uri)` to `print(rec["uri"])`. |
| 🟡 Medium | docs-engine-2 | docs-mismatch | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/docs/Tooling/aid_engine.md:164` | aid-engine doc: runCheck called with one argument, but opts (CheckOptions) is required | Pass a valid options object in the error-handling example, e.g. `await runCheck('example.com', { timeoutMs: 5000, allowFallback: true, wellKnownTimeoutMs: 2000 })`. |
| 🟡 Medium | parity-1 | parity | `packages/aid-java/src/main/java/org/agentcommunity/aid/Parser.java:150-151 (Java); packages/aid/src/client.ts:268-282 (TS); Go/Py/Rust/.NET: absent` | Past `dep` (deprecation) timestamp produces three different behaviors across the 6 SDKs | Decide on one layer and one behavior. Recommended: keep `parse()` format-only in ALL SDKs (remove the `dep.isBefore(now())` check from Java Parser.java:150-151 — it makes a well-formed record unparseable and emits the wrong error code), and implement the spec's discovery-layer guidance uniformly in Go/Python/Rust/.NET `discover()` (warn on future dep, fail gracefully on past dep) to match TS. Add a golden/parity fixture with a PAST `dep` so the shared harness catches future drift. Also reconsider whether 'fail gracefully' should be `ERR_INVALID_TXT` (currently used by TS) — `ERR_INVALID_TXT` means 'malformed or missing required keys', which a deprecated-but-valid record is not. |
| 🟡 Medium | parity-3 | parity | `packages/aid-go/parser.go:15-32` | Go parser silently accepts duplicate keys and empty keys instead of rejecting them | In Go `parseRaw`, after splitting, reject empty key or value (`ERR_INVALID_TXT "Empty key or value in pair"`) and reject a key already present in the map (`ERR_INVALID_TXT "Duplicate key: <key>"`), matching the other five SDKs. Add shared golden fixtures for duplicate-same-key and empty-key so the parity harness enforces it. |
| 🟡 Medium | parity-4 | test-gap | `test-fixtures/golden.json:invalid[] array; packages/aid-conformance/src/runner.ts:53-56` | Shared parity/conformance harness cannot catch parser-edge divergences (no malformed-pair/empty-key/duplicate-key fixtures; conformance runner is TS-only) | Add invalid fixtures to golden.json: malformed-pair (`v=aid2;garbage;u=https://x/mcp;p=mcp`), empty-key (`=foo;v=aid2;...`), empty-value, and duplicate-same-key (`v=aid1;v=aid2;...`), each with `errorCode: ERR_INVALID_TXT`. These will fail Go (and any other drifting SDK) until fixed. Separately, document that aid-conformance is TS-only and that cross-language enforcement lives in each SDK's own parity test against golden.json. |
| 🟡 Medium | ci-1 | build-ci | `.github/workflows/security.yml:24, 95` | CodeQL matrix includes 'rust' which is preview-only and lacks a toolchain in the job; autobuild will run with no rustup installed | Remove 'rust' from the CodeQL matrix (cover Rust via cargo audit/clippy instead) OR gate it on a CodeQL version known to support Rust and add a rustup/cargo setup step before autobuild. Confirm 'csharp' autobuild has the .NET SDK (it does via setup-dotnet) and 'go' autobuild works. |
| 🟡 Medium | ci-2 | build-ci | `.github/workflows/release.yml:1-65` | Release pipeline only publishes npm + PyPI; crates.io, NuGet, and Maven Central have package metadata but NO publish automation | Add publish jobs (or at least a documented manual runbook) for cargo publish (crates.io), dotnet pack + nuget push (NuGet, needs <PackageId>/IsPackable — current csproj has neither), and gradle publish to Maven Central (build.gradle has no maven-publish plugin or signing config). Otherwise drop the implication that these registries are first-class. |
| 🟡 Medium | ci-4 | correctness | `.github/workflows/showcase-dns.yml:55-69` | showcase-dns purge loop is broken for >100 records: deleting page N shifts the result set so later pages skip records | Always re-fetch page 1 after each delete batch (loop `while there are still _agent.* matches on page 1`), or collect ALL ids first across all pages and only then delete, or filter server-side with the CF API name filter. Do not advance the page cursor across a mutating result set. |
| 🟡 Medium | ci-6 | test-gap | `.github/workflows/ci-typescript.yml:61-79` | doctor-e2e-matrix CI job builds aid + aid-doctor on two OSes but runs no test, check, or CLI invocation | Add the actual doctor invocation/e2e step (e.g. `node packages/aid-doctor/dist/cli.js check <fixture>` or `pnpm -C packages/e2e-tests run e2e:pka`) so the matrix verifies behavior, or delete the job to stop advertising macOS coverage it doesn't provide. |
| 🟡 Medium | ci-7 | security | `.github/workflows/security.yml:56, 65` | trufflehog pinned to floating @main in the security workflow | Pin to a release tag (e.g. @v3.x.y) or, for strongest guarantees, a full commit SHA. Apply the same to any future floating refs. |
| 🟡 Medium | ci-8 | build-ci | `.github/workflows/security.yml:70-72` | License compliance check samples only 10 files and never fails the build | Remove `head -10`, group the find predicates with parentheses, and make missing headers fail the step (collect violations and `exit 1` if any). Or drop the step if header enforcement isn't actually desired. |
| 🟡 Medium | ci-14 | build-ci | `.github/workflows/showcase-dns.yml:12-18` | No concurrency group on 10 of 11 workflows; destructive showcase-dns can run concurrently on rapid main pushes | Add a `concurrency: { group: showcase-dns-${{ github.ref }}, cancel-in-progress: false }` to showcase-dns (serialize, do not cancel a partial apply) and a standard cancel-in-progress group to the build/test/security workflows. |
| 🟡 Medium | docs-1 | docs-mismatch | `packages/aid-rs/README.md:101` | aid-rs README handshake example does not compile (missing required domain arg) | Update the README example to pass the final `domain` argument, e.g. `perform_pka_handshake(&rec.uri, rec.pka.as_deref().unwrap(), "", std::time::Duration::from_secs(2), None).await?;`. Ideally add this snippet to a `cargo test --doc`/doctest gate so README API drift is caught by CI. |
| 🟡 Medium | docs-2 | docs-mismatch | `README.md:6-7` | README CI build-status badge points to non-existent ci.yml workflow | Point the badge at an existing workflow file (e.g. ci-typescript.yml or ci-parity.yml), or aggregate into a real status. Consider linking the workflow whose green state best represents 'build passing'. |
| ⚪ Low | protocol-3 | docs-mismatch | `packages/docs/specification.md:85` | Spec field table omits the normative desc ≤ 60 UTF-8 byte cap that constants.yml and the parser both enforce | Add the “MUST be ≤ 60 UTF-8 bytes” constraint to the `desc` row (or a footnote) in specification.md so the spec matches the YAML source-of-truth and parser enforcement. Remember to run `pnpm docs:verify` and commit the regenerated export-manifest files since this edits packages/docs/**. |
| ⚪ Low | aid-3 | correctness | `packages/aid/src/client.ts:74-80 (and browser.ts:143-147)` | looksLikeAidRecord gate over-matches `version=aidN`, which the parser cannot consume | Make the gate and parser agree: either drop `version` from the looksLikeAidRecord alternation (preferred, since `version` is not a spec key), or add a `version` alias to parseRawRecord. Add a test for a `version=aid2` TXT record asserting the chosen behavior. |
| ⚪ Low | correctness-1 | correctness | `packages/aid-doctor/src/output.ts:140-156` | Doctor [6/6] step line renders '✅ No change' for binding_loss while pushing a BINDING_LOSS warning | Add an explicit `else if (status === 'binding_loss')` arm rendering a warn icon (e.g. '⚠️ Domain-binding lost (endpoint-proof only)'). Add an output-render test for downgrade.status='binding_loss' (currently none — cli.test.ts has no binding_loss render case). |
| ⚪ Low | parity-2 | parity | `packages/aid-engine/src/checker.ts:380-460` | Engine checkDowngrade block never enforces downgradePolicy=fail and unconditionally persists the cache entry, unlike doctor applySecurityState | Either remove the engine's checkDowngrade cache block entirely (it is dead in production and duplicates applySecurityState), or make it enforce downgradePolicy parity with applySecurityState (including shouldRejectForFailPolicy semantics and cacheEntry nulling). Consolidating into one shared function (see parity-1) resolves both divergences at once. |
| ⚪ Low | docs-mismatch-1 | docs-mismatch | `packages/aid-engine/src/index.ts:6-9` | aid-engine documented as 'pure, stateless, no side effects' but performs network I/O, reads process.env, and uses non-deterministic clock | Reword the engine description to reflect reality (e.g. 'no filesystem or CLI side effects; performs network I/O for discovery/TLS/PKA'). Document the AID_SKIP_SECURITY env override explicitly (it weakens security and is currently undocumented). Consider injecting a clock/now() for testability if determinism matters. |
| ⚪ Low | test-gap-2 | test-gap | `packages/aid-conformance/src/runner.ts:314-319` | Conformance runner does not validate the aid-domain positioning / exact-covered-set contract for domain-bound vectors | Add a positional covered-set validator to the runner mirroring SDK validateV2CoveredSet: covered must equal base-4 exactly, or base-4 with aid-domain;req inserted at index 3, and nothing else. This lets the conformance pack reject malformed binding vectors the same way the SDK does. |
| ⚪ Low | correctness-2 | correctness | `packages/aid-doctor/src/cli.ts:191` | --code flag is a no-op on check/json success path; commands always exit with the specific report exitCode regardless of the flag | Decide one semantics and apply consistently: either (a) honor --code on the report path too (`process.exit(options.code ? report.exitCode : (report.exitCode === 0 ? 0 : 1))`), or (b) update the help text to clarify that granular codes are always emitted on the report path and --code only affects thrown errors. Add a test asserting the chosen behavior for a report-level failure without --code. |
| ⚪ Low | dead-code-1 | dead-code | `packages/aid-engine/src/checker.ts:172-182` | report.pka.covered and report.pka.createdSkewSec are declared but never populated (always null) | Either thread covered[] and created (and compute createdSkewSec = now - created) out of performPKAHandshake into the report, or remove the two fields from PkaBlock if they are not needed. If kept, add them to the v2 result type and surface in output --show-details. |
| ⚪ Low | go-4 | security | `packages/aid-go/fallback.go:35-41` | Well-known fallback reads entire response body before enforcing 64KB cap (unbounded memory) | Bound the read: `data, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024+1))` then check `len(data) > 64*1024`. This caps allocation regardless of what the server sends. |
| ⚪ Low | go-5 | parity | `packages/aid-go/parser.go:768-785` | isBareIntegerToken accepts negative created/expires timestamps; TS requires /^\d+$/ | Drop the leading-'-' branch in isBareIntegerToken so only digit-only tokens are accepted, matching TS /^\d+$/. Add a v2 negative test asserting a negative created/expires is rejected at parse time. |
| ⚪ Low | go-6 | build-ci | `packages/aid-go/fallback.go:1-70` | error.go and fallback.go are not gofmt-compliant and CI never runs gofmt/go vet/lint | Run gofmt -w on error.go and fallback.go, and add a CI step `gofmt -l packages/aid-go \| tee /dev/stderr \| (! read)` plus `go vet ./...` (and optionally golangci-lint) to .github/workflows/ci-go.yml so future drift fails the build. |
| ⚪ Low | go-7 | test-gap | `packages/aid-go/pka_vectors_test.go:170-194` | Six shared v2 PKA vectors are never driven through the Go handshake (cross-language parity not enforced) | Add a table-driven test that loops all v2 vectors (mirroring TestPKAVectors), mocks the HTTP response from each vector's response.signature_input/signature, drives performPKAHandshake, and asserts pass/fail per the vector's expect field. This guarantees every shared v2 vector is enforced in Go. |
| ⚪ Low | go-8 | docs-mismatch | `packages/aid-go/README.md:298-304` | README v2 handshake summary omits the domain-binding covered set and AID-Domain header | Extend the README v2 section to document the optional domain-bound covered set (`\"aid-domain\";req` between @authority and @status), the single tag aid-pka-v2 for both modes, the AID-Domain request header, and the DiscoveryResult.DomainBound field. |
| ⚪ Low | go-9 | docs-mismatch | `packages/aid-go/README.md:138-147` | README error-code table omits ERR_FALLBACK_FAILED (1005), which the code emits | Add a `\| 1005 \| ERR_FALLBACK_FAILED \| The .well-known fallback failed or returned invalid data \|` row to the README error table (text already exists in constants_gen.go ErrorMessages). |
| ⚪ Low | go-10 | build-ci | `packages/aid-go/go.mod:1` | go.mod module path (github.com/agentcommunity/aid-go) does not match README install/import path | Decide the canonical import path and make go.mod and the README agree. If the intended public path is .../agent-identity-discovery/aid-go, update the module directive (and confirm the published tag/VCS path matches); otherwise fix the README to use github.com/agentcommunity/aid-go. |
| ⚪ Low | test-gap-1 | test-gap | `packages/aid-py/tests/test_pka_vectors.py:187-737` | Several shared v2 PKA vectors are never exercised in Python (no negative-path coverage for no-store, v2 keyid mismatch, freshness window, uppercase-alg) | Add a v2 vector-replay path that feeds the signed `v2-*` pass vectors (uppercase-alg, ipv6-authority) and fail vectors (missing-cache-control-no-store, missing-expires, long-expires-window, keyid-thumbprint-mismatch) through `_perform_v2_pka_handshake`/`_parse_v2_signature_headers`, asserting pass/ERR_SECURITY. At minimum add an explicit test that a missing `Cache-Control: no-store` response is rejected. |
| ⚪ Low | parity-2 | parity | `packages/aid-py/aid_py/pka.py:711` | v1 PKA signature base uses urlparse netloc (includes userinfo) where TS uses URL.host (no userinfo) | Compute the v1 host from hostname+port (excluding userinfo) to match TS, e.g. reuse the authority logic or `parsed.netloc.rsplit('@',1)[-1]`. Low priority given v1 is legacy. |
| ⚪ Low | packaging-1 | build-ci | `packages/aid-py/pyproject.toml:5-17` | PyPI package metadata missing classifiers (no Python-version, License, Topic, or Development Status trove classifiers) | Add a `classifiers` list with the MIT license, supported Python minor versions (3.8-3.12), `Development Status :: 5 - Production/Stable`, and `Topic :: Internet :: Name Service (DNS)` / `Security` as appropriate. |
| ⚪ Low | docs-2 | docs-mismatch | `packages/aid-py/README.md:145` | README claims the [pka] extra installs PyNaCl, but the extra only declares cryptography | Either add `PyNaCl>=1.5` to the `pka` extra in pyproject.toml, or correct the README to say the extra installs only `cryptography` (and mention PyNaCl as an optional alternative backend). |
| ⚪ Low | robustness-1 | correctness | `packages/aid-py/aid_py/discover.py:87, 97-121` | discover() **kwargs silently swallows misspelled security-relevant keyword arguments (fail-open) | After consuming the two known aliases, raise `TypeError` on any remaining unexpected key in `kwargs` (e.g. `if kwargs: raise TypeError(f"unexpected keyword arguments: {sorted(kwargs)}")`), so typos surface instead of silently degrading security posture. |
| ⚪ Low | rust-4 | correctness | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/aid-rs/src/pka.rs:596-602` | build_v2_signature_base returns empty Vec instead of an error on the unreachable aid-domain-without-domain branch (weaker fail-closed than TS) | Change `build_v2_signature_base` (and ideally `build_signature_base`) to return `Result<Vec<u8>, AidError>` and return an explicit `Err(AidError::new("ERR_SECURITY", "Signature covers aid-domain but no AID-Domain was sent"))` on the None branch, matching the TS defense-in-depth contract, then propagate at the call site instead of relying on empty-base verification failure. |
| ⚪ Low | rust-5 | parity | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/aid-rs/src/discover.rs:135-137` | Rust discovery discards the domainBound result with no in-code documentation of the gap | Add a short comment at discover.rs:135-137 and well_known.rs:84-86 stating that domainBound is intentionally discarded (verification-only parity, surfacing is a fast-follow), and add a one-line note to README that Rust discovery does not yet expose domainBound. If/when surfaced, introduce a `DiscoveryResult` wrapper threaded through both discover.rs and well_known.rs. |
| ⚪ Low | rust-6 | build-ci | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/.github/workflows/ci-rust.yml:16-36` | CI installs rustfmt but never runs clippy or fmt --check, and never tests the default (no-handshake) feature set | Add `cargo fmt --all -- --check` and `cargo clippy --features handshake -- -D warnings` (and a clippy run on default features) to the workflow, and run `cargo test --locked` once without features in addition to the handshake run. Refresh the branch trigger list. |
| ⚪ Low | rust-7 | parity | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/aid-rs/src/pka.rs:422-430` | v2 timestamp parser accepts negative created/expires that the TS reference rejects (parser-strictness parity divergence) | Reject a leading '-' in `parse_bare_i64_param` (require all chars be ASCII digits, no sign) to match the TS `\d+` contract, and add a negative-timestamp rejection test. |
| ⚪ Low | rust-8 | parity | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/aid-rs/src/pka.rs:379-419` | v2 Signature-Input parameter splitting is not quote-aware (split on ';' inside quoted values), diverging from the TS structured-field parser | Use a quote-aware splitter for the parameter section (analogous to the existing `split_dict_members` which already tracks in_string/escaped), or document that parameter values are restricted to token charset and add a test asserting the behavior on a quoted-semicolon value. |
| ⚪ Low | dotnet-1 | correctness | `packages/aid-dotnet/src/Discovery.cs:116 (called from async DiscoverAsync at 136)` | Sync-over-async: DiscoverAsync blocks a thread on the PKA handshake via .GetAwaiter().GetResult() | Make ParseSingleValid async (Task<(AidRecord,bool)>) and `await Pka.PerformHandshakeAsync(...).ConfigureAwait(false)`; await it from DiscoverAsync. This removes the blocking call and matches the WellKnown.FetchAsync pattern. |
| ⚪ Low | dotnet-3 | dead-code | `packages/aid-dotnet/dotnet-8-runtime.pkg:n/a` | Committed binary/cruft: misnamed dotnet-8-runtime.pkg (388KB HTML page) and stale test_results.trx tracked in git | git rm both files; add `TestResults/` and `*.trx` (and optionally `*.pkg`) to packages/aid-dotnet/.gitignore. |
| ⚪ Low | dotnet-4 | correctness | `packages/aid-dotnet/src/Base58.cs:20-29` | Base58 decode produces one extra byte for all-zero (all-'1') inputs | When n == BigInteger.Zero, use an empty body (`Array.Empty<byte>()`) so only the leading-zero bytes are emitted: `var bytes = n == BigInteger.Zero ? Array.Empty<byte>() : n.ToByteArray(isBigEndian: true, isUnsigned: true);`. |
| ⚪ Low | dotnet-5 | docs-mismatch | `packages/aid-dotnet/README.md:6` | README claims 'No external runtime dependencies' but the SDK hard-depends on NSec.Cryptography | Replace the claim with something accurate, e.g. 'Runtime dependency: NSec.Cryptography (Ed25519 verification)'. |
| ⚪ Low | dotnet-7 | correctness | `packages/aid-dotnet/src/Discovery.cs:46 (also Handshake.cs:44, WellKnown.cs:39)` | New HttpClient + HttpClientHandler created and disposed per network call (socket-exhaustion pattern) | Use a single static lazily-initialized HttpClient (AllowAutoRedirect=false) and pass a per-request timeout via a linked CancellationTokenSource, or a SocketsHttpHandler with PooledConnectionLifetime, instead of per-call construction+dispose. |
| ⚪ Low | java-4 | parity | `packages/aid-java/src/main/java/org/agentcommunity/aid/Handshake.java:584` | parseV2CoveredItem omits the unknown-component-name guard that TS and Go both enforce at parse time | Add the same name allowlist check inside parseV2CoveredItem so an unknown component throws `Unsupported covered field: <name>` at parse time, matching TS/Go. Then add a test feeding e.g. `"@bogus";req` in slot 3 and asserting that message. |
| ⚪ Low | java-9 | test-gap | `packages/aid-java/src/main/java/org/agentcommunity/aid/WellKnown.java:63` | Discovery.discover(), WellKnown.fetch/fetchBound, and the loopback HTTP relaxation have no test coverage | Add HttpServer-backed tests for WellKnown.fetchBound covering: happy path, wrong content-type, >64KB body, non-object JSON, and the loopback http relaxation (allowInsecure true/false). Add at least one Discovery.discover() test against a local stub to catch the java-1 DoH name bug. |
| ⚪ Low | dry-1 | dead-code | `packages/web/src/lib/api/handshake-security.ts:3-8 (identical copy in packages/web/src/app/api/handshake/route.ts:185-190)` | isPrivateHost duplicated verbatim in two files — divergence and incomplete-fix risk | Extract a single shared host-safety helper (ideally the hardened version) and import it in both places. |
| ⚪ Low | ssrf-4 | security | `packages/web/src/app/api/og/docs/route.tsx:11-15, 65, 71, 90` | OG image route renders unbounded untrusted query params (title/description/slug) | Cap each param length (e.g. title.slice(0,120), description.slice(0,200), slug.slice(0,120)) before rendering. |
| ⚪ Low | trav-1 | security | `packages/web/src/lib/docs/content.ts:109-122 (reached from packages/web/src/app/api/docs/[...slug]/route.ts:8-10)` | Dev-only docs fs-fallback joins unsanitized slug into a filesystem path | Reject slugs containing '..' or path separators before the fs join, or resolve and assert the final path stays within docsDir. Low priority since the production Workers path never hits this branch. |
| ⚪ Low | handshake-ssrf-1 | security | `packages/web/src/app/api/handshake/route.ts:185-190 (isPrivateHost); duplicated in packages/web/src/lib/api/handshake-security.ts:3-8` | Handshake API SSRF guard misses IPv6 loopback, 0.0.0.0, and cloud metadata (169.254.169.254) | Centralize one hardened allow/deny check: reject IPv6 loopback/ULA/link-local (`::1`, `fc00::/7`, `fe80::/10`), `0.0.0.0`, `127.0.0.0/8`, `169.254.0.0/16`, IPv4-mapped IPv6, and non-decimal IP encodings; normalize the host before matching. Where feasible resolve the hostname and re-check the resolved IP (mitigates DNS rebinding). Add negative tests for `::1`, `0.0.0.0`, and `169.254.169.254`. Deduplicate the two isPrivateHost copies into one shared helper. |
| ⚪ Low | use-connection-dead-1 | dead-code | `packages/web/src/hooks/use-connection.ts:86-144` | Dead useConnection() hook carries a latent guidance/agentCard handshake bug | Delete the unused `useConnection` hook (keep `AuthRequiredError` and the type exports), or, if it must stay, mirror LiveDatasource's guidance-first branch so it does not silently mislabel non-MCP protocols. |
| ⚪ Low | pka-demo-failclosed-test-gap-1 | test-gap | `packages/web/src/app/api/pka-demo/route.ts:50-62, 116-124` | Missing test for pka-demo fail-open when client covers aid-domain but sends no AID-Domain header | Add a test asserting the route's chosen behavior for 'Accept-Signature covers aid-domain but no AID-Domain header sent' (either it signs unbound or returns 400) so the contract is pinned. A 400 'aid-domain covered but AID-Domain header missing' would be the cleaner, fail-closed mirror of the SDK. |
| ⚪ Low | docs-1 | docs-mismatch | `packages/docs/Understand/concepts.md, packages/docs/Reference/versioning.md, packages/docs/Reference/security.md, packages/docs/Understand/faq.md:concepts.md:120; versioning.md:54; security.md:154; faq.md:46` | PKA acronym expanded as "Public Key Attestation" in 4 docs, contradicting the spec glossary's authoritative "Public Key for Agent" | Replace "Public Key Attestation" with "Public Key for Agent" in concepts.md:120, versioning.md:54, security.md:154, and faq.md:46 to match the authoritative glossary definition. Note: editing these docs files shifts the export manifest, so run `pnpm docs:verify` and commit the regenerated packages/docs/export-manifest.json and .sha256. |
| ⚪ Low | docs-2 | docs-mismatch | `packages/docs/Reference/troubleshooting.md:31` | troubleshooting.md ERR_UNSUPPORTED_PROTO lists only 4 of the 9 registered protocol tokens | Either list all 9 tokens (mcp, a2a, openapi, grpc, graphql, websocket, local, zeroconf, ucp) or replace with a pointer to the canonical list, e.g. "Use a token from the protocol registry (see Protocols & Auth Tokens)." |
| ⚪ Low | docs-3 | docs-mismatch | `packages/docs/Reference/pka.md:130-131` | pka.md base "Rejection Checklist" states covered-components/tag rules that the later Domain Binding section relaxes, with no forward reference | Add a forward reference on the base "Covered Components" / Rejection Checklist (e.g. "unless the optional domain-binding component is present; see Domain Binding Profile below"), mirroring the spec B.6 item 3 phrasing, so the base checklist is not read as forbidding a valid bound proof. |
| ⚪ Low | docs-engine-1 | docs-mismatch | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/docs/Tooling/aid_engine.md:73-75` | aid-engine doc: validateTxtRecord result uses validation.errors but the function returns { isValid, error } | Change the second log to `console.log(validation.error); // undefined when valid, message string when invalid` to match the `{ isValid, error? }` return shape. |
| ⚪ Low | docs-doctor-1 | docs-mismatch | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/docs/Tooling/aid_doctor.md:117` | aid-doctor doc overstates 'pka generate' output: it prints the public key only, not the derived keyid | Adjust the sentence to say `pka generate` prints only the base64url JWK `x` public key (and saves the private key), or have the command also print the derived keyid if that is the intended behavior. |
| ⚪ Low | docs-engine-3 | docs-mismatch | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/docs/Tooling/aid_engine.md:93-104` | aid-engine doc DoctorReport type drifts from source (cacheEntry optionality and field order) | Update the documented interface to `cacheEntry: CacheEntry \| null;` and match field ordering, or add a note that the block is abridged/illustrative. |
| ⚪ Low | docs-java-dotnet-1 | docs-mismatch | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/docs/quickstart/quickstart_java.md:1-44` | Java and .NET quickstarts have no install/dependency instructions (no Maven/NuGet coordinates) | If/when the Java and .NET SDKs are published, add Install sections with the real Maven coordinates and `dotnet add package` id. Until then, add a one-line note that these SDKs are consumed from source / not yet published, mirroring the Rust quickstart's path-dependency note. |
| ⚪ Low | ci-9 | build-ci | `.github/workflows/ci-parity.yml:33-35` | Go toolchain version is inconsistent across CI and below go.mod's required version in the parity job | Align all Go setup-go versions to a single value that satisfies go.mod (>=1.23, ideally matching the toolchain 1.24.x), or set go-version-file: packages/aid-go/go.mod so CI tracks the module's declared version automatically. Remove the 1.22 pin. |
| ⚪ Low | ci-10 | build-ci | `.github/workflows/security.yml:104-113` | SBOM is generated with a Node-only generator for all six languages, producing five mislabeled non-JS SBOMs | Generate the npm SBOM once (gate on matrix.language == 'javascript-typescript') and use ecosystem-appropriate tools for the others (e.g. cyclonedx-gomod, cargo-cyclonedx, cyclonedx-py, CycloneDX dotnet tool, cyclonedx-gradle), or drop the per-language naming. |
| ⚪ Low | ci-12 | build-ci | `.github/workflows/ci-rust.yml:17` | actions-rs/toolchain is archived/unmaintained and uses deprecated runner Node versions | Replace with the maintained dtolnay/rust-toolchain@stable (with components: rustfmt). Swatinem/rust-cache@v2 already handles caching. |
| ⚪ Low | ci-13 | build-ci | `package.json:48` | prepare script uses deprecated 'husky install' | Change to `"prepare": "husky"` (husky v9+ form). The .husky/pre-commit hook is already in the correct v9 format (no shebang / no husky.sh sourcing), so no further migration is needed. |
| ⚪ Low | docs-3 | docs-mismatch | `AGENTS.md:12,39` | AGENTS.md references packages/web/WORKBENCH_COMPONENTS.md but file is WORKBENCH_COMPONENTS_2.md | Update both references in AGENTS.md to `packages/web/WORKBENCH_COMPONENTS_2.md`, or rename the file back to the un-suffixed name if that was the intent. |
| ⚪ Low | docs-4 | docs-mismatch | `README.md:350` | README links to ./CODE_OF_CONDUCT.md which is not in the repo | Either add a CODE_OF_CONDUCT.md (or a stub that links to the org-wide policy), or change the link to the external agentcommunity/.github conduct doc that CONTRIBUTING.md already points to. |
| ⚪ Low | docs-5 | docs-mismatch | `packages/aid/README.md:17` | Three published-package READMEs use wrong GitHub org slug 'agent-community' (hyphenated) | Replace `agent-community` with `agentcommunity` in all three README 'GitHub' links. Consider a repo-wide grep guard (the only legitimate 'agent-community' references are PyPI-org-name discussions in tracking/RELEASE.md). |
| ⚪ Low | parity-1 | parity | `packages/aid-go/README.md:298-308` | Non-TS SDK READMEs (Go, Rust, Python, .NET, Java) omit domain-binding entirely despite all implementing it | Add a short 'Domain binding' note to each non-TS SDK README mirroring packages/aid/README.md:90,95 (AID-Domain sent by default, domainBound returned, domain-bound proof keeps the same `aid-pka-v2` tag and additionally covers `"aid-domain";req` after `"@authority";req`). At minimum, fix the aid-go and aid-rs 'covered fields set' lines so they don't assert the set is exactly 4 components. |
| ⚪ Low | test-gap-1 | test-gap | `packages/e2e-tests/src/pka_e2e.ts:229-297` | pka_e2e loopback suite has no negative path for domain binding (mismatch / fail-closed) | Add a loopback case where the server returns an aid-domain-covering `aid-pka-v2` response while the doctor is run with `--domain-binding off`/no AID-Domain (expect rejection), and a `--domain-binding require` run against an unbound `aid-pka-v2` server (expect non-zero exit), asserting the failing exit code rather than success. |
| ⚪ Low | test-gap-2 | test-gap | `packages/aid-conformance/src/runner.ts:314-420` | Conformance runner does not assert aid-domain coverage for domain-bound pass vectors | When a vector carries a top-level `domain`/`aid_domain` (domain-bound vectors), assert `covered` includes `aid-domain;req` at index 3 and that the covered length is base-4 or base-4+1, mirroring the SDKs' coverage-derived domainBound rule, so the shared vectors enforce the one-tag contract at the conformance layer. |
| 🔵 Info | protocol-4 | parity | `scripts/generate-constants.ts:607-720` | Generated constants emit ERROR_MESSAGES only for TS/Python/Go; Rust/.NET/Java drop human-readable error strings | If error messages are intended to be part of the constants contract in every language, extend the Rust/.NET/Java generators to emit a message map (mirroring Go/Python). Otherwise add a short comment in the generator documenting that messages are intentionally TS/Python/Go-only, so the asymmetry is not later mistaken for a generation bug. |
| 🔵 Info | aid-5 | dead-code | `packages/aid/src/client.ts:85-111` | Dead/duplicated canonicalizeRaw block left commented-out in client.ts | Delete the commented-out block (client.ts:85-111). |
| 🔵 Info | build-ci-1 | build-ci | `packages/aid-conformance/package.json:43-47` | aid-conformance package.json lists LICENSE in files[] but no LICENSE exists in the package directory | Either add a per-package LICENSE (or symlink/copy the root LICENSE at build time) or remove 'LICENSE' from files[] across the published TS packages to silence the npm warning and ensure the published tarball actually contains a license. |
| 🔵 Info | style-1 | style | `packages/aid-py/aid_py/discover.py:69, 77` | Module global DNS_TTL_DEFAULT defined after its only use (read at line 69, defined at line 77) | Move the constant above the function (or reuse the already-imported `DNS_TTL_MIN`) so the fallback TTL is defined before use and not a second copy of 300. |
| 🔵 Info | rust-9 | dead-code | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/aid-rs/src/record.rs:14-37` | Unused/dead AidError constructors and duplicate record structs (AidRecordV1 mirrors AidRecord field-for-field) | Consider making `as_v1()` return a borrowed view or removing `AidRecordV1` in favor of `AidRecord` (or add a doc note explaining why the duplicate exists). No functional change required. |
| 🔵 Info | rust-10 | test-gap | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/aid-rs/src/pka.rs:89-103` | canonicalize_aid_domain has no direct unit-test coverage despite being a security-relevant normalizer | Add unit tests for `canonicalize_aid_domain`: trailing-dot stripping (`Example.COM.` -> `example.com`), uppercase folding, empty/whitespace rejection, and rejection of an out-of-charset value (e.g. containing `/` or a space). |
| 🔵 Info | dotnet-6 | style | `packages/aid-dotnet/src/Discovery.cs:123 (also Handshake.cs:177, WellKnown.cs:35)` | Public async API exposes no CancellationToken (non-idiomatic for a .NET async networking library) | Add `CancellationToken cancellationToken = default` to the public async methods and pass it to SendAsync/GetAsync/JsonDocument.ParseAsync. Optional given the SDK's minimal scope, but it is the expected idiom flagged in the review focus. |
| 🔵 Info | dotnet-9 | parity | `packages/aid-dotnet/src/WellKnown.cs:35-77` | Well-known fallback does not enforce dep (deprecation) expiry, unlike TS | Decide explicitly whether dep-expiry enforcement is part of the cross-SDK contract. If yes, add the past-dep ERR_INVALID_TXT check to WellKnown.FetchAsync (and Discovery). If no, document the intentional scope difference. |
| 🔵 Info | java-11 | build-ci | `packages/aid-java/build.gradle:3` | jacoco plugin applied but no coverage report wired into build/test and no verification gate | Either wire jacocoTestReport (finalizedBy on test) and a minimal coverage gate into the real test task, or remove the unused jacoco plugin to avoid implying coverage enforcement that does not exist. |
| 🔵 Info | pka-demo-spec-link-1 | docs-mismatch | `packages/web/src/app/api/pka-demo/route.ts:90` | pka-demo JSON 'spec' link uses /docs/ base inconsistent with the codebase's docs.agentcommunity.org/aid/ convention | Point `spec` at the canonical published URL (e.g. `https://aid.agentcommunity.org/docs/reference/pka` or `https://docs.agentcommunity.org/aid/reference/pka`, whichever is the live host) and verify it 200s. |
| 🔵 Info | docs-a2a-1 | style | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/docs/quickstart/quickstart_a2a.md:50` | A2A quickstart TypeScript snippet uses 'any', which the project style bans | Use `Record<string, unknown>` instead of `{ [scheme: string]: any }` to model the AgentCard field while staying consistent with the repo's no-any rule. |
| 🔵 Info | parity-7 | parity | `packages/aid-py/aid_py/discover.py:40-43` | Minor: Python 'Multiple valid records' error message omits the version, unlike the other four discovery SDKs | If exact message parity matters for tooling/tests, interpolate the selected version into the Python message to match the other four. Otherwise leave as-is (informational). |
| 🔵 Info | ci-15 | build-ci | `.github/workflows/ci-python.yml:17` | setup-python and setup-go action major versions drift across workflows (some on EOL Node-16 actions) | Standardize on one major version per action across all workflows (setup-python@v5, checkout@v4 or @v5 consistently), ideally via a shared composite/reusable setup. |
| 🔵 Info | ci-16 | build-ci | `.github/workflows/ci-typescript.yml:5-7` | Workflow push/PR triggers reference stale feature branches that no longer exist | Trim the branch lists to currently-relevant branches (likely just main, plus any active release/feature branch). |
| 🔵 Info | ci-17 | docs-mismatch | `.changeset/pka-domain-binding.md:7` | Three overlapping changesets give the merged changelog contradictory 'optional profile' vs 'default' framing for the same feature | Consolidate the three domain-binding changesets into one coherent entry (or reword the earlier ones to past/superseded framing) before `changeset version`, so the published CHANGELOG tells a single consistent story. |
| 🔵 Info | ci-18 | test-gap | `scripts/docs-check.mjs:349-468` | docs-authority canonical PKA check validates only the unbound vector, not the two domain-bound vectors | Extend docs-check.mjs to also assert the structure of v2-db-rfc9421-domain-bound (covered === base-4 with 'aid-domain;req' at index 3, tag aid-pka-v2, expected_result pass) and v2-db-domain-mismatch (expected_result fail), so the one-tag/coverage contract is enforced at the authority layer too. |
| 🔵 Info | info-1 | other | `.changeset/sdk-parity-domain-binding.md:1-9` | sdk-parity changeset bumps @agentcommunity/aid although parity work touched only non-TS SDKs | Optional: clarify in the changeset body that the version bump is a no-op marker for the JS package and the substantive changes are in the non-JS SDKs, or attach the parity note to aid-doctor/aid-engine instead if more appropriate. |

## Appendix C — Completeness critic gaps

- **[medium] g1 web spec-adapters/v1.ts isCap** — isCap precedence bug: isCap(null) throws TypeError, malformed resource cap passes; normalizeHandshake crashes on null capability. Reproduced. → _check:_ Move resource branch inside null guard; test null entry.
- **[medium] g2 triple builders** — core.ts, aid-generator.ts, engine generator.ts all validate independently; drift risk. → _check:_ Diff vs engine and parser; unify.
- **[high] g3 streams empty** — 7 of 15 streams empty coverageNotes; ~98 web files unopened. → _check:_ Backfill web-api/web-ui/parity/ci-release.
- **[medium] g4 pka-key-generator** — Mints Ed25519 keys in browser, unreviewed crypto UI. → _check:_ Confirm getRandomValues, no key leak.
- **[low] g5 og route** — Renders user input to image, no bounds, no test. → _check:_ Clamp inputs.
- **[high] packages/docs/specification_v2_explained.md (v2 explainer draft, rendered at /docs)** — This 33KB user-facing doc was opened by ZERO of the 15 reviewers (docs-spec and docs-quickstart both reported coverageNotes: none; the file is absent from the 354 reviewed paths). It predates the domain-binding profile entirely — last modified 2026-06-08, whereas specification.md got the domain-binding + one-tag rewrite on 2026-06-14 (commit 2361af8b). Its threat model (§3.2) has NO unauthorized-association entry, its policy modes (§3.3) list only pka/dnssec/well-known/downgrade and OMIT domain-binding=off\|prefer\|require, and its Appendix B stops at B.6 with a 4-component-only covered set — there is no B.7, no AID-Domain header, no aid-domain;req component, no domainBound indicator. This directly contradicts the normative spec and all six SDKs. It is in export-manifest.json (#116) and docs-index.json, so it renders live at /docs. → _check:_ Open packages/docs/specification_v2_explained.md and bring §3.2 (add unauthorized-association to the threat model), §3.3 (add the domain-binding=off\|prefer\|require knob), and Appendix B (add a B.7 Domain Binding section mirroring specification.md lines 491-526: single aid-pka-v2 tag, optional aid-domain;req between @authority and @status, AID-Domain request header, fail-closed client rejection, domainBound derived from coverage) into line with specification.md. Then run `pnpm docs:verify` and commit the regenerated export-manifest.json/.sha256. Verify with: git log -1 --format=%ci -- packages/docs/specification_v2_explained.md vs specification.md, and `python3 -c "import json;print(json.load(open('packages/web/src/generated/docs-index.json'))['docsByRouteSlug']['specification_v2_explained']['content'].lower().count('aid-domain'))"` should be > 0 after the fix (currently 0).
- **[low] packages/docs/specification_v2_explained.md navigation wiring** — The explainer is in the export manifest and docs-index.json (so it renders at a direct /docs URL) but is NOT referenced in any meta.json navigation file (packages/docs/meta.json, Reference/meta.json, etc.). A grep for 'explained' across all meta.json files returns nothing. It may therefore be an orphan page reachable only by direct URL, not via the docs sidebar — either an intentional unlisted draft or an accidental nav omission. No reviewer assessed which. → _check:_ grep -rn 'specification_v2_explained\\|explained' packages/docs/*.json packages/docs/**/meta.json — confirm whether the explainer is intentionally unlisted (draft) or should be added to a meta.json pages array. If it ships rendered content to users it should either be in nav or be excluded from the manifest/index.
- **[low] protocol/pka_vectors.json version field** — The shared vector file still declares "version": 1 even though the two domain-binding vectors (v2-db-rfc9421-domain-bound, v2-db-domain-mismatch) were added. The engine-doctor reviewer explicitly listed this as an unverified follow-up ('check whether pka_vectors.json version: 1 should bump now that db vectors were added and whether any consumer keys off it'); no stream resolved it. → _check:_ grep -rn '\.version\\|\["version"\]\\|version ==' across all six SDK pka_vectors loaders to see if any consumer reads/asserts the version field; if a consumer pins it, decide whether adding vectors warrants a bump to 2. If nothing reads it, document that the field is informational only.
- **[low] packages/aid-engine/tsup.config.bundled_0d0kugbprslq.mjs and tsup.config.bundled_x7e2yhljjj.mjs** — Two tsup-generated temporary bundle files (24 lines each, committed 2025-09-03 in PR #65) are tracked in git. These are build cruft that tsup emits transiently; no .gitignore rule covers the 'tsup.config.bundled_*' pattern. No reviewer opened or flagged them. They are noise in the tree and can cause spurious diffs on rebuild. → _check:_ Confirm with `git ls-files 'packages/aid-engine/tsup.config.bundled_*.mjs'` then `git rm` the two artifacts and add 'tsup.config.bundled_*.mjs' (or '*.bundled_*.mjs') to .gitignore. Verify a fresh `pnpm -C packages/aid-engine build` does not require them.
- **[low] Root and web build/lint config (tsconfig.base.json, tsconfig.json, pnpm-workspace.yaml, eslint.config.mjs, packages/web/{next.config.js,open-next.config.ts,postcss.config.js,tailwind.config.js,vitest.config.ts}, per-package tsup.config.ts/vitest.config.ts, tsup.config.base.ts)** — This cluster of build/tooling config was not in any reviewer's opened-file list (the aid stream explicitly noted tsup/vitest/tsconfig were 'out of primary scope'). Low drift risk for the PKA refactor (no tag content), but for a literal 100% audit they are unchecked. pnpm-workspace.yaml in particular governs which packages are built/tested and was never confirmed to include all 11 in-scope packages. → _check:_ cat pnpm-workspace.yaml and confirm its globs cover every package under packages/* (including aid-conformance and e2e-tests). Spot-check tsconfig.base.json for the strict/exactOptionalPropertyTypes flags the CLAUDE.md style guide mandates. These are sanity confirmations, not expected to reveal refactor drift.

### Files flagged as not opened by any reviewer

- `packages/web/src/lib/generator/core.ts`
- `packages/web/src/lib/aid-generator.ts`
- `packages/web/src/spec-adapters/v1.ts`
- `packages/web/src/components/ui/pka-key-generator.tsx`
- `packages/web/src/app/api/og/docs/route.tsx`
- `packages/web/src/hooks/chat-engine/reducer.ts`
- `packages/docs/specification_v2_explained.md`
- `packages/docs/index.md`
- `packages/docs/export-manifest.json`
- `packages/docs/export-manifest.sha256`
- `packages/web/CHANGELOG.md`
- `packages/web/WORKBENCH_COMPONENTS_2.md`
- `packages/web/components.json`
- `packages/aid-engine/tsup.config.bundled_0d0kugbprslq.mjs`
- `packages/aid-engine/tsup.config.bundled_x7e2yhljjj.mjs`
- `tsconfig.base.json`
- `tsconfig.json`
- `pnpm-workspace.yaml`
- `eslint.config.mjs`
- `tsup.config.base.ts`
- `packages/aid/tsup.config.ts`
- `packages/aid/vitest.config.ts`
- `packages/aid-doctor/tsup.config.ts`
- `packages/aid-conformance/tsup.config.ts`
- `packages/aid-engine/tsup.config.ts`
- `packages/web/next.config.js`
- `packages/web/open-next.config.ts`
- `packages/web/postcss.config.js`
- `packages/web/tailwind.config.js`
- `packages/web/vitest.config.ts`
- `packages/aid/CHANGELOG.md`
- `packages/aid-doctor/CHANGELOG.md`
- `packages/aid-engine/CHANGELOG.md`
- `packages/aid-conformance/CHANGELOG.md`
- `scripts/docs-check.mjs`
- `scripts/docs-export.mjs`
- `scripts/generate-examples.ts`
- `scripts/open-spec-1.2-enterprise-hardening-issues.mjs`
- `showcase/terraform/examples.tf`
- `.github/ARCHITECTURE.md`
- `.github/CLI_GITHUB.md`
- `.github/CONTRIBUTING-spec.md`
- `.github/pull_request_template.md`
- `DOCS_RENDERER_PLAN.md`
- `agent.md`
- `tracking/POST_RELEASE_TODO.md`
- `tracking/NIST_COMMENT_DRAFT.md`
- `tracking/iana/AID_DEVELOPMENT_TIMELINE.md`
- `tracking/iana/EVIDENCE_ANNEX.md`
- `tracking/iana/DRAFT_REPO.md`
- `tracking/iana/TODO_SINGLE_SOURCE_WORKFLOW.md`
- `tracking/iana/AGENTS.md`

## Appendix D — Dismissed (sample; verifier-rejected false positives)

| Sev | ID | Category | Location | Issue | Fix |
|---|---|---|---|---|---|
| 🔵 Info | protocol-2 | test-gap | `packages/aid-go/pka_v2_test.go:79-571` | Cross-language vector coverage is asymmetric: shared negative v2 fail vectors are exercised by-ID only in the TS SDK; other SDKs rebuild equivalents inline | Consider a shared parametrized loop in each non-TS SDK that iterates all v2 vectors and asserts pass/fail by `expect` (as the SDKs already do for v1 vectors via filtered iteration in pka_vectors_test.go:170-192 and test_pka_vectors.py:23), so the shared negative vectors become a true 6-language contract. |
| 🔵 Info | correctness-3 | correctness | `packages/aid-engine/src/checker.ts:341` | v1 PKA handshake invoked with empty-string kid when an aid1 record lacks kid, routing to V1 path with an empty key id | Guard explicitly: if v1 and !record.kid, set pka.verified=false with a clear 'aid1 PKA requires kid' error instead of passing ''. Add a negative test for an aid1 pka record missing kid. |
| 🔵 Info | correctness-4 | correctness | `packages/aid-doctor/src/cache.ts:127-135` | migrateCacheFile fast-path returns schemaVersion:3 files without per-entry validation or keyid/jwkX/domainBound backfill | On the fast path, still run entries through isCacheEntry + migrateEntry (idempotent) so backfill is guaranteed, and reject array-typed entries (`!Array.isArray(entries)`). Add tests for a v3 file with a partial entry and with entries:[]. |
| 🔵 Info | go-11 | correctness | `packages/aid-go/discover.go:56` | idna.ToASCII error is discarded in DiscoverWithOptions | Optionally surface a clear error on idna failure (e.g. ERR_INVALID_TXT/ERR_NO_RECORD with a 'malformed domain' message) instead of proceeding with a best-effort label, or at minimum document the parity with TS's best-effort behavior. |
| ⚪ Low | dotnet-8 | parity | `packages/aid-dotnet/src/Parser.cs:151` | dep timestamp parsing stricter than Go/TS: rejects fractional seconds and other valid ISO-8601 UTC forms | Relax to accept RFC3339/ISO-8601 UTC including optional fractional seconds (e.g., DateTimeOffset.TryParse with AssumeUniversal + RoundtripKind, then require endsWith('Z')), matching Go's RFC3339. Add a fractional-second dep fixture to the shared golden set so all SDKs are tested for it. |
| ⚪ Low | java-2 | build-ci | `.github/workflows/ci-java.yml:38` | ci-java runs only HandshakeTest (synthetic JWS); the real Java SDK test suites run in no CI workflow | Change the CI step to run the full module test task (`./gradlew :aid-java:test`) so AidV2Test and ParityTest execute, and/or add a Gradle job to ci-parity. Gate merges on the real suites. |
| 🔵 Info | java-8 | test-gap | `packages/aid-java/src/test/java/org/agentcommunity/aid/AidV2Test.java:913` | Java tests reference only 4 of 17 shared PKA vectors; several scenario vectors never verified directly | Add a generic data-driven test that iterates every vector in protocol/pka_vectors.json keyed off an expect field (or explicit pass/fail lists), as Go/TS do, so all shared scenarios are verified in Java. |
| 🔵 Info | java-10 | parity | `packages/aid-java/src/main/java/org/agentcommunity/aid/Discovery.java:177` | looksLikeAidRecord accepts a `version=` alias key that the parser does not recognize, causing inconsistent record detection | Drop the `version` alias from looksLikeAidRecord (only `v` is the spec key), or confirm against constants.yml; keep detection and parsing consistent on the same key set. |
| 🔵 Info | consistency-1 | parity | `packages/web/src/app/api/pka-demo/route.ts:12-119` | PKA one-tag / domain-binding contract is fully consistent across route, tests, and e2e (no stale aid-pka-v2-db) — confirmation note | No action — documenting that this area is correct and consistent so a completeness critic need not re-investigate the one-tag refactor here. |
| ⚪ Low | a2a-href-xss-1 | security | `packages/web/src/components/workbench/a2a-card.tsx:30, 44` | A2A agent card renders remote-controlled url/provider.url as href without scheme validation | Validate/normalize agent-card URLs to http(s) only in validateAgentCard (reject or drop non-http(s) schemes), and/or guard at render with an isHttpUrl() check before emitting the href. Apply the same guard anywhere remote card fields become hrefs. |
| 🔵 Info | protocol-result-type-1 | type-safety | `packages/web/src/lib/protocols/types.ts:31-37, 48-49` | ProtocolResult.data.security.pka and top-level security.pka types omit domainBound that runtime provides | Add `domainBound?: boolean` to the pka shapes in ProtocolResult.data.security and ProtocolResult.security in types.ts so the contract matches the runtime payload (or reference a single shared pka security type). |
| 🔵 Info | docs-4 | other | `packages/docs/specification.md:481-526` | Cross-link and anchor integrity verified: zero stale aid-pka-v2-db references, all internal links resolve | No action required; recorded so a completeness critic can see these dimensions were checked. |
| 🔵 Info | docs-ts-1 | docs-mismatch | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/docs/quickstart/quickstart_ts.md:26` | TS quickstart proto comment lists an incomplete protocol set (omits grpc/graphql/websocket/zeroconf) | Either list all supported tokens or append `…` / 'see Protocols reference' so readers don't treat the four as the full set. |
| 🔵 Info | parity-5 | parity | `packages/aid-rs/src/discover.rs:135-141 (DNS path), 153 (well-known path)` | Rust discovery discards the domainBound PKA-state indicator required by spec Appendix B.7 / step 10 | Introduce a Rust `DiscoveryResult { record: AidRecord, domain_bound: bool, ... }` wrapper threaded through both discover.rs and well_known.rs (capture the bool returned by `perform_pka_handshake` instead of dropping it at `?`), matching Go/.NET/Java. Until then, keep the quickstart caveat and track it as an open parity item; consider a parity test asserting the field exists once added. |
| 🔵 Info | parity-6 | parity | `packages/aid-engine/src/checker.ts:133, 342-360 (TS enforcement); Go/Py/Rust/.NET/Java discover entrypoints lack equivalents` | domain-binding=require (and other Local Policy Controls) enforced only in TS; thin SDKs surface domainBound but cannot enforce binding/downgrade/pka policies | Document explicitly (e.g. in discovery_api.md and each quickstart) that Section 3.3 policy enforcement (`domain-binding=require`, `pka=require`, `downgrade`, `dnssec=require`) is provided by the TS engine/doctor and is not yet a knob on the thin Go/Python/Rust/.NET (and partial Java) `discover()` entrypoints, so consumers needing hard enforcement must implement it on top of the surfaced `domainBound`/trust-source values. Consider adding at least a `domainBindingPolicy` enum to the thin SDKs for parity since they already compute `domainBound`. |
| 🔵 Info | ci-5 | build-ci | `.changeset/sdk-parity-domain-binding.md:1-6` | @agentcommunity/aid-conformance is npm-published and bundles the PKA vectors, but the one-tag refactor changed those vectors with no changeset bumping it | Add @agentcommunity/aid-conformance (minor or patch) to a changeset for the PKA vector change so its published version tracks the bundled vectors. |
| 🔵 Info | ci-11 | build-ci | `.github/workflows/security.yml:59` | Secret-scanning diff base is empty on the first push to a branch, breaking the diff range | Handle the zero-SHA case (fall back to a full filesystem scan, or to the default branch as base) when github.event.before is 0000000000000000000000000000000000000000. |
| ⚪ Low | docs-6 | docs-mismatch | `packages/aid-py/README.md:36` | aid-py README discover() return annotation '-> (dict, int)' contradicts its own DiscoveryResult usage | Change the signature annotation to `-> DiscoveryResult` (or the actual return type) to match the prose and the Quick Start example. |



---

# Round 2 — Coverage Closure (the 52 previously-unopened files)

> Run `wf_933f29d6-d49` · 52 agents · 102 files opened (the 52 gap files + cross-references).

**Round 2 confirmed:** 29 — 2 high, 7 medium, 17 low, 3 info; dismissed 6.

## Round-2 addendum (synthesis)

# Round-2 Coverage-Closure Addendum

## Summary

This addendum closes the coverage gap surfaced by the two completeness critics after Round 1: exactly the 52 files that no Round-1 reviewer had opened were reviewed here, reaching true full-repo coverage. The review confirmed **30 findings** (6 candidates were dismissed, none disputed). The dominant theme is **documentation drift around the shipped v2 domain-binding profile**: the live, routable explainer (`specification_v2_explained.md`) still presents a closed four-component PKA covered set and a pre-domain-binding threat model, contradicting the normative spec's Appendix B.7 single-tag (`aid-pka-v2`) domain-binding contract. Secondary themes are stale agent/contributor/IANA context docs that misstate the project as pre-v2, three divergent TXT builder/validator code paths in `packages/web` (two correctness/parity bugs plus one dead duplicate), and a cluster of low-severity config/CI/security hardening gaps (locale-sensitive manifest hash, missing `exactOptionalPropertyTypes` enforcement on the web package, committed tsup bundle artifacts, OG-route input clamping, missing HSTS/CSP). No reviewed file contained a stale `aid-pka-v2-db` tag reference outside permitted history/vector contexts; the one-tag contract holds in all 52 files.

## Confirmed Findings

### High

**EXP-03 — Explainer Appendix B has no B.7 domain-binding profile**
- Location: `packages/docs/specification_v2_explained.md:428-513`
- Problem: Appendix B stops at B.6 with a fixed four-component covered set and no domain binding. The normative spec adds Appendix B.7 (`specification.md:493-526`): the `AID-Domain` request header, optional `aid-domain;req` component between `@authority;req` and `@status`, single-tag rule (`aid-pka-v2`; domain-bound iff the covered set includes `aid-domain`), canonical A-label/lowercase/portless value, 403/no-`Signature-Input` response when a server does not serve the named domain, the fail-closed reject (a client that did not send `AID-Domain` MUST reject a response covering `aid-domain`), and the boolean domain-binding indicator. The explainer's MUST/SHOULD-voice Appendix B contradicts the shipped wire contract.
- Fix: Add a B.7 subsection mirroring `specification.md` B.7, or replace Appendix B with a pointer to the normative Appendix B plus a superseded notice.

**RDOC-01 — `agent.md` is a severely stale duplicate of `AGENTS.md`, contradicting shipped v2 reality**
- Location: `agent.md:42-69, 153-189`
- Problem: `agent.md` (7667 bytes) duplicates the role of the current `AGENTS.md` (6403 bytes) but is frozen at a pre-v1.0 snapshot and is wrong on nearly every status claim now that v2.0.0 is normative. Specifics: line 51 "Current Work (feat/optimize_workbench)"; line 189 "Current Branch: feat/optimize_workbench"; line 188 "Last Updated: 2025-01-08"; lines 24-26 label Python/Go "(private)" and Rust/.NET/Java "(WIP)" (all released v2 SDKs); lines 44-50 present Phases 0-3 as the only completed work with Phase 4 still ahead; line 166 lists "SRV record support (AID v2)" as a future "Long Term" item (doubly wrong — v2 has shipped and is a TXT-record evolution, not an SRV cutover). A contributor/agent opening `agent.md` next to `AGENTS.md` will be actively misled about version, default branch, and SDK maturity.
- Fix: Delete `agent.md`, or replace its body with a one-line pointer to `AGENTS.md`. Do not maintain two divergent agent-context files at the repo root.

### Medium

**EXP-02 — Enterprise policy modes (§3.3) omits the `domain-binding=off|prefer|require` knob**
- Location: `packages/docs/specification_v2_explained.md:260-276`
- Problem: §3.3 lists only PKA (`if-present|require`), DNSSEC (`off|prefer|require`), Well-known (`auto|disable`), and Downgrade (`off|warn|fail`). The domain-binding policy is missing. The spec (`specification.md:253-255`) defines `domain-binding=off|prefer(default)|require`, noting only `require` mitigates unauthorized association and that `pka=require` and `domain-binding=require` compose.
- Fix: Add the domain-binding knob (`off|prefer|require`, default `prefer`) with require-enforces / prefer-records-only semantics matching `specification.md:253-255`, or deprecate the section.

**EXP-07 — §3.1 "PKA does not prove" list omits the endpoint-consent (domain-binding) negative claim**
- Location: `packages/docs/specification_v2_explained.md:232-238`
- Problem: §3.1 lists five negatives (user authorization, OAuth token validity, SPIFFE SVID, internal policy approval, key-change continuity) but omits "that the endpoint consents to serve as the agent for the queried domain." The spec adds exactly that bullet (`specification.md:206`) and ties it to the unauthorized-association explanation and domain-binding profile — the conceptual hook the feature hangs on.
- Fix: Add the endpoint-consent negative with a forward reference to domain binding (matching `specification.md:206`), or supersede.

**EXP-08 — Live explainer page is orphaned from sidebar nav but fully routable; contradictory content reachable by direct URL/search/sitemap**
- Location: `packages/docs/specification_v2_explained.md:1-12`
- Problem: The explainer is NOT in any `packages/docs` `meta.json` and NOT in the docs-index navigation tree, but IS in `fileSlugs` and `docsByRouteSlug` (title "AID v2 Design Notes") with prerendered HTML at `packages/web/.next/server/app/docs/specification_v2_explained.html`. It renders at `/docs/specification_v2_explained`, reachable by direct URL, internal links, docs search, and sitemap, but not via the sidebar. The EXP-01..07 contradictions are user-reachable while lacking nav context that would frame the page as legacy; its body uses MUST/SHOULD wire-format language that is now wrong.
- Fix: Decide whether the page stays live. If kept: add a prominent superseded banner atop §3.2, §3.3, and Appendix B pointing to `specification.md`, gate the route, or update the sections. If retired: remove the route and the export-manifest entry.

**WEB-V1-001 — `isCap()` operator-precedence bug: throws TypeError on null and admits malformed resource caps**
- Location: `packages/web/src/spec-adapters/v1.ts:73-82`
- Problem: The guard is written so `&&` binds tighter than `||`, leaving only the `=== 'tool'` branch protected; the trailing `|| (x as {type}).type === 'resource'` runs against raw `x` with no null/object guard. Reproduced: (1) `isCap(null)` → `TypeError: Cannot read properties of null (reading 'type')`, which propagates out of `normalizeHandshake` via `.filter((c) => isCap(c))` (v1.ts:91) when a capabilities array contains a null element. (2) `isCap({type:'resource'})` returns `true` with no `id` key, so the subsequent `.map` (v1.ts:92-98) emits a `CanonicalCapability` with `id: undefined`, violating the `id: string` contract (`spec-adapters/types.ts:15`); any value with `x.type === 'resource'` is accepted. Currently latent (no production consumer of `selectAdapter`/`normalizeHandshake` found outside the adapter module and tests), but the adapter layer is the intended stable normalization boundary.
- Fix: Wrap the whole predicate in the object/null guard and parenthesize the type-token check, e.g. `return typeof x === 'object' && x !== null && 'id' in x && 'type' in x && ((x as {type:unknown}).type === 'tool' || (x as {type:unknown}).type === 'resource');`. Add a regression test passing `capabilities: [null, {type:'resource'}, {id:'x',type:'tool'}]` asserting no throw and that the id-less resource cap is dropped.

**WEB-CORE-003 — `dep` ISO-8601 validation in `core.ts` over-rejects valid timestamps and accepts impossible dates (drift vs SDK)**
- Location: `packages/web/src/lib/generator/core.ts:78-82`
- Problem: `core.ts` validates `dep` with `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/` (no fractional seconds, no real-date check); the SDK (`parser.ts:307`) uses `/Z$/.test(dep) && !Number.isNaN(Date.parse(dep))`. Confirmed divergences: (1) false negative — `2026-01-01T00:00:00.500Z` (valid ISO 8601 UTC with ms) is rejected by core, accepted by SDK; (2) false positive — `2026-13-01T00:00:00Z` (month 13) is accepted by core, rejected by SDK (`Date.parse` → NaN). The Generator UI can declare a nonsensical deprecation timestamp valid and let the user publish a record a real SDK client then rejects.
- Fix: Replace the regex-only check with the SDK semantics (`/Z$/` plus `!Number.isNaN(Date.parse(dep))`), or validate via the engine/parser. If fractional seconds are intentionally disallowed in the UI, document that and align the SDK too.

**DOCS-EXPORT-01 — Manifest hash depends on locale-sensitive sort (plus 6 secondary script findings)**
- Location: `scripts/docs-export.mjs:36-51`
- Problem (primary): `docs-export.mjs` sorts files by `localeCompare` on absolute paths (l36-38) feeding the aggregate hash that gates CI; ICU locale or Node build differences can reorder and break `docs:verify`. Secondary findings (bundled due to size cap): (2, medium) `docs-check.mjs:7-17` `REFERENCE_FILES` is stale — the 9 listed files contain zero docs links so link validation is a no-op, while the 5 SDK READMEs and `packages/web/src/lib/docs/markdown.ts` (which do carry links) are unlisted; (3, low) `docs-check.mjs:666-668` `fs.readFile` over `REFERENCE_FILES` has no `fileExists` guard, so a renamed component crashes `docs:check` with a raw ENOENT; (4, low) `generate-examples.ts:242-245` swallows prettier failures and writes unformatted/broken output with exit 0, and `icon/name/domain` are interpolated unescaped at l171-176; (5, low) `generate-examples.ts:161-165` silently drops examples whose category is outside the 5 hardcoded filters; (6, info) open-spec script l259-266 positional placeholder replacement is dead for the current plan; (7, info) open-spec script l100-124/l323 dry-run still calls `gh` list (not offline), `main` has no try/catch, and preview understates labels.
- Fix: Sort by relative path with a locale-independent comparator. Also refresh/expand `REFERENCE_FILES`, guard the `fs.readFile`, fail-loud on prettier errors and escape `icon/name/domain`, assert known categories, and harden the issue-opener dry-run.

**RDOC-02 — `EVIDENCE_ANNEX.md` tells IANA reviewers "current deployed version is aid1" — false since v2 shipped**
- Location: `tracking/iana/EVIDENCE_ANNEX.md:29, 31`
- Problem: The Core Claim section states "AID v1.x uses a TXT record at `_agent.<domain>`" (line 29) and "The current deployed version is `aid1`" (line 31). This is an externally-facing evidence document compiled for IANA designated-expert review. The shipped/normative version is now v2 (`protocol/constants.yml` specVersion `aid2`, schemaVersion `2.0.0`; `specification.md:81` "For v2 it MUST be aid2"; README v2.0 Release Status). A reviewer relies on a "current deployed version" claim, so the outdated value misleads. The `_agent` label-stability thesis the annex argues still holds under v2 and is strengthened by it.
- Fix: Update the Core Claim to state the current deployed version is `aid2` (with `aid1` as a legacy compatibility version), and refresh the "Evidence From the Current Web Adapter" / "Generated Type Surface" sections. Keep and reinforce the `_agent` label-stability thesis.

### Low

**EXP-01 — Threat model §3.2 omits the unauthorized-association threat and its domain-binding mitigation**
- Location: `packages/docs/specification_v2_explained.md:242-258`
- Problem: §3.2 lists mitigations (DNS spoofing, endpoint impersonation, PKA removal/key replacement, version downgrade, command injection, cross-origin redirects) but has no unauthorized-association entry. The normative spec (`specification.md:208, :224`) treats it as a first-class threat mitigated by the domain-binding profile (Appendix B.7), which v2 clients SHOULD request by default. A live page presenting itself as the v2 threat model while missing a named shipped threat is misleading.
- Fix: Add an Unauthorized-association mitigation bullet referencing Appendix B.7 (matching `specification.md:224`), or strengthen the superseded banner.

**EXP-04 — B.4 Covered Components presents a closed four-component set, contradicting the now-optional `aid-domain` component**
- Location: `packages/docs/specification_v2_explained.md:473-482`
- Problem: B.4 states "The v2 PKA response signature covers:" then exactly four bullets (`@method;req`, `@target-uri;req`, `@authority;req`, `@status`) as exhaustive. The spec (`specification.md:481, :514`) makes the covered set either those four OR those four plus optional `aid-domain;req` between `@authority;req` and `@status`. The closed enumeration is false-by-omission: an implementer would build a verifier that rejects the legitimate domain-bound shape the spec mandates clients request by default.
- Fix: Note that the covered set may optionally include `aid-domain;req` between `@authority` and `@status` (matching `specification.md:514`), or supersede the appendix.

**EXP-05 — B.6 Verifier Summary omits the domain-binding acceptance, fail-closed, and indicator rules**
- Location: `packages/docs/specification_v2_explained.md:498-513`
- Problem: B.6 lists nine accept conditions; item 3 requires covered components and tag `aid-pka-v2` to match the closed four-component profile. It includes none of the shipped domain-binding obligations: accepting a covered set that also includes `aid-domain` (spec B.7 item 1/514), verifying domain-bound only when `aid-domain` is covered and matches the queried domain (item 2/515), the MUST-reject fail-closed rule (item 3/516), and exposing the boolean indicator (item 4/517). A conformant-to-explainer verifier would reject the spec-blessed default request shape and omit fail-closed protection.
- Fix: Extend B.6 to accept the optional `aid-domain`-covered shape and add the fail-closed reject and domain-binding-indicator obligations (matching `specification.md` B.7 items 1-5), or supersede.

**EXP-09 — Front-matter and header dates ("23 May 2026" / tag 2026-05-23) misrepresent the currency of a live page**
- Location: `packages/docs/specification_v2_explained.md:11-22`
- Problem: The YAML front-matter tag is `2026-05-23` (line 11) and the body header says "Date: 23 May 2026" (line 18) with "Status: Non-normative design notes" (line 20). Content was last touched 2026-06-08; the normative spec it tracks was rewritten 2026-06-14 to add the entire domain-binding profile. A visible date three weeks stale relative to the spec reinforces the false impression that Appendix B / §3.2 / §3.3 reflect the current wire format. Low (metadata) but compounds EXP-01..07.
- Fix: If retained, update the dateline to mark this as frozen historical content and note the spec moved on (superseded by `specification.md` as of 2026-06-14, which added the domain-binding profile).

**WEB-AIDGEN-004 — `aid-generator.ts` is orphaned/dead production code with a second divergent TXT builder+validator**
- Location: `packages/web/src/lib/aid-generator.ts:1-53`
- Problem: The file exports `buildTxtRecord`, `validateTxt`, and `AidGeneratorData`, but a repo-wide search found NO importer of `@/lib/aid-generator` in any production source — the only references are its own self-referential doc comment (line 2) and its test (`packages/web/src/tests/aid-generator.test.ts:2`). The live Generator UI uses `packages/web/src/lib/generator/core.ts` via `use-generator-form.ts`. So this is a third independent TXT builder/validator kept alive only by a test, adding to the builder-drift surface. Its `validateTxt` is also weaker than core.ts/SDK (only checks `v===aid2`, presence of `u`, presence of `p`, and rejection of `i`/`kid`; no proto/uri/auth/desc-bytes/docs/dep/pka). Notably it is the ONLY one of the three web/engine builders that actively rejects legacy `i`/`kid` aliases (line 48) — a check `core.ts` lacks.
- Fix: Delete `packages/web/src/lib/aid-generator.ts` and its test, consolidating on `core.ts` (or the engine). Before deleting, port the `i`/`kid` rejection (aid2 disallows `kid`) into `core.ts` so the live Generator surfaces it, matching SDK `parser.ts:319-322` which throws on `kid` in aid2.

**OG-1 — OG image route renders unbounded, unclamped user-supplied query params (public, unauthenticated)**
- Location: `packages/web/src/app/api/og/docs/route.tsx:10-15, 65, 73`
- Problem: `GET /api/og/docs` is public and unauthenticated. It reads `title`, `description`, and `slug` directly from `request.nextUrl.searchParams` and renders them into a 1200x630 image via next/og (Satori) with NO length clamp, truncation, or `overflow:hidden`/`textOverflow`. The trusted caller (`app/docs/[[...slug]]/page.tsx:46`) supplies bounded frontmatter, but the route cannot rely on that — any client can pass arbitrary values. This is NOT XSS (Satori renders text as escaped SVG glyph paths). The real exposure: (a) resource exhaustion — Satori lays out and rasterizes arbitrarily long strings on every cache-miss; an attacker varying the query string (`?v=1,2,3...`) defeats the `s-maxage=31536000` edge cache and forces expensive renders on the Cloudflare Worker (CPU/memory, possible OOM or sub-request timeout); (b) the response is cached `public, s-maxage=31536000` (route.tsx:84) so attacker-controlled garbage images get pinned at the edge. Grep confirms zero `slice`/`substring`/`length`/`overflow`/`textOverflow` in the file.
- Fix: Clamp each param before rendering (e.g. `title.slice(0,120)`, `description.slice(0,200)`, `slug.slice(0,100)`) and add `overflow:'hidden'`, `textOverflow:'clip'` (and a `maxHeight`) on the title/description containers. Optionally normalize `slug` to `[A-Za-z0-9/_-]` since it is interpolated into the displayed URL string at line 73.

**OG-2 — OG image route has no test coverage**
- Location: `packages/web/src/app/api/og/docs/route.tsx:10`
- Problem: No test references this route. A search for `og/docs`/`api/og`/`ImageResponse` across the web test suite returns zero hits (the similarly named `pka-demo-route.test.ts` covers a different route, `/api/pka-demo`). There is no regression test asserting default fallback values, that a 1200x630 image is returned, the `Cache-Control` header, or behavior on oversized input — so the OG-1 hardening (or any future regression) would go uncaught.
- Fix: Add a route unit test invoking GET with (a) no params (asserts defaults "Documentation" / "Agent Identity & Discovery"), (b) normal params, and (c) oversized params (asserts the OG-1 clamp), checking status 200, content-type `image/png`, and the `Cache-Control` header.

**WEBCFG-1 — `WORKBENCH_COMPONENTS_2.md` protocol list omits the `ucp` (Universal Commerce Protocol) token**
- Location: `packages/web/WORKBENCH_COMPONENTS_2.md:9`
- Problem: The Overview enumerates "MCP, A2A, OpenAPI, GraphQL, gRPC, WebSocket, Local, Zeroconf" (line 9). The actual registry in `packages/web/src/lib/protocols/index.ts:23` registers a ninth token, `ucp` (`['ucp', new GuidanceHandler('ucp')]`). `ucp` is a first-class token in the source of truth — `protocol/constants.yml:25` defines `ucp: 'Universal Commerce Protocol'`, and `packages/aid/src/constants.ts` exports `PROTO_UCP = 'ucp'`. Descriptive prose, not a normative contradiction, but a reader auditing protocol coverage from this doc would miss a real supported protocol.
- Fix: Add `UCP` to the protocol list in the Overview (line 9) to match the tokens registered in `src/lib/protocols/index.ts`. Consider deriving such lists from constants to prevent drift.

**WEBCFG-2 — `next.config.js` security-header block omits HSTS and Content-Security-Policy**
- Location: `packages/web/next.config.js:94-118`
- Problem: The `headers()` block sets `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy` on `/(.*)` but defines neither `Strict-Transport-Security` (HSTS) nor `Content-Security-Policy`. Confirmed absent across the package (grep returns nothing; no Cloudflare `_headers` file; no `middleware.ts`). The site is public and performs in-browser Ed25519 PKA keypair generation (`src/components/ui/pka-key-generator.tsx`), so a missing CSP slightly weakens defense-in-depth against injected script. HSTS may be applied at the Cloudflare edge (not in-repo), which is why this is low.
- Fix: Add `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` and a baseline `Content-Security-Policy` to the `headers()` array (or confirm HSTS is enforced at the Cloudflare edge and document that in the file comment). At minimum, document the intentional omission so future reviewers do not re-flag it.

**RBT-01 — `tsconfig.base.json` is missing `exactOptionalPropertyTypes` (CLAUDE.md mandate) and is never extended by any package**
- Location: `tsconfig.base.json:2-13`
- Problem: CLAUDE.md mandates "TypeScript strict mode with `exactOptionalPropertyTypes`." `tsconfig.base.json` sets only `"strict": true` (line 6), not `exactOptionalPropertyTypes`. Worse, it is effectively dead config: no tsconfig extends it. All four SDK packages (`aid`, `aid-engine`, `aid-doctor`, `aid-conformance`) extend the ROOT `../../tsconfig.json`, and `packages/web/tsconfig.eslint.json` extends its own local `./tsconfig.json`. The only references to `tsconfig.base.json` are `turbo.json:22` (a build CACHE input, not a TS extends), `README.md`, and tracking docs. So the file participates in the turbo cache key but governs zero type-checking; the mandated flag is enforced only via root `tsconfig.json:7`.
- Fix: Either (a) add `"exactOptionalPropertyTypes": true` and `"noImplicitAny": true` to `tsconfig.base.json` AND make packages extend it (consolidating root `tsconfig.json` into base), or (b) if base is intentionally dead, delete it and drop the `turbo.json:22` cache input. As-is, its name implies a shared base but it carries weaker flags than the root tsconfig packages actually extend.

**RBT-02 — `packages/web` is excluded from every tsconfig that enforces `exactOptionalPropertyTypes`**
- Location: `packages/web/tsconfig.json:2-29`
- Problem: Root `tsconfig.json:16` explicitly excludes `packages/web` (`"exclude": ["packages/web"]`). `packages/web/tsconfig.json` is fully standalone (no `extends`) and sets `"strict": true` (line 7) but NOT `exactOptionalPropertyTypes`. The web package is the largest TS surface in the repo (Next.js workbench + docs renderer; it imports `aid-engine` via path alias on line 27), so the CLAUDE.md "strict mode with `exactOptionalPropertyTypes`" mandate is not enforced for web code. Longstanding drift, not introduced by the PKA refactor, but a real gap against the documented style rule.
- Fix: Add `"exactOptionalPropertyTypes": true` to `packages/web/tsconfig.json` (or have it extend the shared base once RBT-01 is resolved), then fix resulting type errors. If web is intentionally exempt, document that exemption in CLAUDE.md so the mandate is not stated as repo-wide.

**RBT-03 — Two tsup-generated bundle artifacts are committed to git with no `.gitignore` rule**
- Location: `packages/aid-engine/tsup.config.bundled_0d0kugbprslq.mjs:1-24` (and `tsup.config.bundled_x7e2yhljjj.mjs`)
- Problem: These transient bundle files are emitted by tsup while loading a TS config that imports from another package (`../../tsup.config.base.ts`). Committed in PR #65 (commit `0f3e163d`, 2025-09-03) and still tracked. They are byte-identical and hardcode a stale author-machine absolute path inside an inline base64 sourcemap (`/Users/user/dev/side-projects/AgentCommunity/agent-interface-discovery/...` — an old repo name and home dir that no longer exist). Nothing imports or references them (grep returns only the tracking review doc). The root `.gitignore` has no pattern matching `tsup.config.bundled_*` or `*.bundled_*.mjs`. They cause spurious rebuild diffs and leak a stale filesystem path.
- Fix: `git rm packages/aid-engine/tsup.config.bundled_*.mjs` and add a rule such as `**/tsup.config.bundled_*.mjs` (or `*.bundled_*.mjs`) to `.gitignore`. Confirm a fresh `pnpm -C packages/aid-engine build` regenerates and does not depend on the committed copies.

**RDOC-03 — `CLI_GITHUB.md` Optimization Matrix mislabels Parity/Security triggers as path-filtered**
- Location: `.github/CLI_GITHUB.md:29-30`
- Problem: The doc's thesis (lines 14-16, 33-36) is that path-based optimization was removed and all language/parity/security jobs now run on every PR and push because branch protection requires them. But the Optimization Matrix still carries old path-filter rows: "Parity Check | Any `packages/**` or `protocol/**` ..." (line 29) and "Security Scan | Diff scan on PRs and pushes. Full scan on schedule or manual runs." (line 30). The actual `ci-parity.yml` has NO `paths:` filter — it triggers on push/pull_request to a fixed branch list (`main`, `feat/aid1.1-spec`, `feat/next16-react19-modernization`). The Parity row is both internally inconsistent with the doc's narrative and inaccurate against the real workflow.
- Fix: Update the Parity Check row to "Runs on all PRs and pushes to tracked branches (no path filter)" to match `ci-parity.yml`. Verify the Security Scan diff/full description still matches `security.yml` (which also has no `paths:` filter; the diff-vs-full distinction is mode logic inside the job, so that row is acceptable but worth confirming).

**RDOC-04 — `CONTRIBUTING-spec.md` overstates CI enforcement (alphabetical sort) and omits the changeset + `docs:verify` steps**
- Location: `.github/CONTRIBUTING-spec.md:20-24, 1-12`
- Problem: (1) The Validation section claims "CI will fail if … Token keys are not alphabetically sorted." (line 24). The real gate is `ci-typescript.yml`'s gen-check, which runs `pnpm gen` then `git diff --exit-code` — it enforces that *generated outputs* match committed files. But `generate-constants.ts` sorts token keys on output (`scripts/generate-constants.ts:100-102`, `Object.keys(...).sort()`), so an unsorted-but-otherwise-valid `constants.yml` produces identical sorted generated files and would NOT fail CI. The CI-failure claim for unsorted YAML keys is inaccurate; it is a style convention. (2) The "Proposing a Change" steps stop at "run `pnpm gen` / commit generated artifacts / open a PR" and never mention adding a Changeset (`pnpm changeset`) or, when the change touches `packages/docs/**`, running `pnpm docs:verify` and committing the regenerated export-manifest files — both mandated by CLAUDE.md/AGENTS.md and enforced by `CI (Docs Authority)`. A contributor following only this file hits failing required checks.
- Fix: Reword the alphabetical-sort line to a convention ("keep token keys sorted for clean diffs") or point it at the gen-check that actually runs. Add steps for `pnpm changeset` (user-visible changes) and, for any `packages/docs/**` edits, `pnpm docs:verify` + committing the regenerated `export-manifest.{json,sha256}`, consistent with AGENTS.md and CLAUDE.md.

**RDOC-05 — `POST_RELEASE_TODO.md` is anchored to v1.0.0 and `v=aid1` enforcement, now superseded by v2**
- Location: `tracking/POST_RELEASE_TODO.md:1-3, 54, 68`
- Problem: The roadmap is titled "AID v1.0.0 Post-Release TODO" (line 1) and frames the JSON Schema task around enforcing `v=aid1` and "proto xor p, desc ≤ 60 bytes" (lines 54, 68). Since v2.0.0 is now normative (`v=aid2` required; spec adds PKA JWK key model, domain binding, enterprise policy modes), several targets are done or restated under v2 semantics. It is a planning doc, so age alone is acceptable; flagged low only because a contributor could mistake the `v=aid1` schema-enforcement bullet for current guidance. It also references `.cursorrule` (lines 3, 135, 189), not the active convention file (the repo uses CLAUDE.md/AGENTS.md).
- Fix: Optional refresh — note at the top that this roadmap predates v2 and that schema/enforcement items now target `v=aid2`, or mark it historical. Low priority; it does not gate any user/contributor workflow.

**showcase-1 — README §7.2 claim "every protocol token has a representative showcase record" is false (websocket and zeroconf missing)**
- Location: `showcase/terraform/README.md:114`
- Problem: Line 114 states "§7.2 — Protocol Tokens: every protocol token has a representative showcase record (mcp, a2a, openapi, grpc, graphql, local, ucp)." `protocol/constants.yml:16-25` defines NINE tokens: mcp, a2a, openapi, grpc, graphql, websocket, local, zeroconf, ucp. The showcase records (per grep over `examples.tf`: a2a, graphql, grpc, local, mcp, openapi, ucp) cover only 7. There is no showcase record for `websocket` or `zeroconf`; "every" overstates coverage.
- Fix: Soften the wording to "each network-facing protocol token used in the showcase has a representative record" / "most protocol tokens have a representative record", or add websocket and zeroconf showcase records to `protocol/examples.yml` and regenerate. The 7-token parenthetical is accurate; only the absolute claim "every protocol token" is wrong.

**showcase-2 — README variable table cites wrong spec section (§2.4) for protocol-specific examples — should be §2.5**
- Location: `showcase/terraform/README.md:62`
- Problem: The variable-table row for `include_protocol_specific` says the optional `_agent._mcp.simple` / `_agent._a2a.gateway` underscore-form examples are "described in spec §2.4." In `specification.md`, §2.4 is "Exact-Host Semantics And Delegation" (line 159) and §2.5 is "Protocol-Specific Names" (line 172) — the section that actually describes `_agent._<proto>.<domain>` names. The same README later cites this correctly as §2.5 (line 112), and `main.tf` cites §2.5 (lines 31, 50). Line 62 is internally inconsistent and points readers to the wrong section.
- Fix: Change "§2.4" to "§2.5" on README line 62 to match `main.tf`, the rest of the README (line 112), and the actual spec section title "Protocol-Specific Names".

### Info

**EXP-06 — Client Discovery Algorithm (steps 8-9) omit the SHOULD-default AID-Domain request and domain-binding indicator**
- Location: `packages/docs/specification_v2_explained.md:184-185`
- Problem: §2.3 step 8 ("If k is present, perform PKA endpoint proof using Appendix B.") and step 9 ("Return endpoint, protocol, metadata, PKA state, and trust source.") do not mention requesting domain binding or returning a domain-binding indicator. The spec (`specification.md:139-140`) says clients SHOULD request domain binding by sending the `AID-Domain` header by default (unless `domain-binding=off`) and return PKA state including the domain-binding indicator.
- Fix: Update §2.3 to note clients SHOULD send `AID-Domain` by default and return the domain-binding indicator (matching `specification.md:139-140`), or supersede.

**RDOC-06 — `DOCS_RENDERER_PLAN.md` is a completed implementation plan with stale paths/labels left at repo root**
- Location: `DOCS_RENDERER_PLAN.md:6-8, 402-404, 538-577`
- Problem: A historical "continuation" implementation plan for the docs renderer (Phases 1/2/6 done, 3/4/5/7 remaining at time of writing). The renderer has since shipped, so the plan is finished. A few embedded snippets would mislead if mistaken for current docs structure: it hardcodes an example worktree path `/Users/user/dev/PROJECTS/AgentCommunity/AID/.worktrees/docs-renderer` (line 7); the sample `llms.txt` and route lists call the spec "v1.1" (line 402, "[Specification](/docs/specification): Full protocol specification (v1.1)") and route rationale/security at top-level `/docs/rationale`, `/docs/security` (lines 403-404) whereas the shipped docs live under `Understand/rationale` and `Reference/security`; the "Docs files (25 total)" tree (lines 546-577) no longer matches the current set (`Understand/`, `Reference/enterprise_rollout.md`, `Reference/packages.md`, `Reference/pka.md`, etc. now exist).
- Fix: Consider moving `DOCS_RENDERER_PLAN.md` into `tracking/plans/` (or deleting) now that the renderer shipped, so a stale "v1.1" label and obsolete route map don't sit at the repo root reading as current. Info-only.

**showcase-3 — README §2.5 title quoted as "Multiple Protocols And Protocol-Specific Compatibility Names" — actual spec title is "Protocol-Specific Names"**
- Location: `showcase/terraform/README.md:112`
- Problem: Line 112 labels §2.5 as "Multiple Protocols And Protocol-Specific Compatibility Names". The real heading in `specification.md:172` is "2.5. Protocol-Specific Names". The section number is correct and the gist is right, but the quoted title does not match the spec verbatim (likely a stale title from an earlier draft).
- Fix: Update the quoted title to "Protocol-Specific Names" to match `specification.md` §2.5 exactly.

## Coverage Statement

These 52 previously-unopened files are now reviewed; combined with Round 1's 354 files, full repo coverage is achieved. No reviewed file contained a stale `aid-pka-v2-db` tag reference outside permitted vector-ID/history contexts — the single-tag `aid-pka-v2` domain-binding contract holds across all 52 files.

## Round-2 confirmed findings (structured)

| Sev | ID | Category | Location | Issue | Fix |
|---|---|---|---|---|---|
| 🟠 High | EXP-03 | docs-mismatch | `packages/docs/specification_v2_explained.md:428-513` | Appendix B has no B.7 domain-binding profile (no AID-Domain header, no aid-domain;req component, no domainBound indicator) | Add a B.7 subsection mirroring specification.md B.7, or replace Appendix B with a pointer to the normative Appendix B plus a superseded notice. |
| 🟠 High | RDOC-01 | docs-mismatch | `agent.md:42-69, 153-189` | agent.md is a severely stale duplicate of AGENTS.md, contradicting shipped v2 reality | Delete agent.md, or replace its body with a one-line pointer to AGENTS.md (the canonical single-source-of-truth context file). Do not maintain two divergent agent-context files at the repo root. |
| 🟡 Medium | EXP-02 | docs-mismatch | `packages/docs/specification_v2_explained.md:260-276` | Enterprise policy modes section 3.3 omits the domain-binding=off\|prefer\|require knob | Add the domain-binding knob (off\|prefer\|require, default prefer) with require-enforces / prefer-records-only semantics (matching specification.md:253-255), or deprecate the section. |
| 🟡 Medium | EXP-07 | docs-mismatch | `packages/docs/specification_v2_explained.md:232-238` | Section 3.1 'PKA does not prove' list omits the endpoint-consent (domain-binding) negative claim | Add the endpoint-consent negative with a forward reference to domain binding (matching specification.md:206), or supersede. |
| 🟡 Medium | EXP-08 | docs-mismatch | `packages/docs/specification_v2_explained.md:1-12` | Live page is orphan from sidebar nav but fully routable; contradictory content reachable by direct URL/search/sitemap without nav context | Decide if the page stays live. If kept: add a prominent superseded banner atop sections 3.2, 3.3, and Appendix B pointing to specification.md, or gate the route, or update the sections. If retired: remove the route and the export-manifest entry. |
| 🟡 Medium | WEB-V1-001 | correctness | `packages/web/src/spec-adapters/v1.ts:73-82` | isCap() operator-precedence bug: throws TypeError on null and admits malformed resource caps | Wrap the whole predicate in the object/null guard and parenthesize the type-token check, e.g. `return typeof x === 'object' && x !== null && 'id' in x && 'type' in x && ((x as {type:unknown}).type === 'tool' \|\| (x as {type:unknown}).type === 'resource');`. This both prevents the null/non-object TypeError and enforces presence of `id` for resource caps. Add a regression test passing `capabilities: [null, {type:'resource'}, {id:'x',type:'tool'}]` and assert no throw plus that the id-less resource cap is dropped. |
| 🟡 Medium | WEB-CORE-003 | parity | `packages/web/src/lib/generator/core.ts:78-82` | dep ISO-8601 validation in core.ts both over-rejects valid timestamps and accepts impossible dates (drift vs SDK) | Replace the regex-only check with the SDK's semantics (`/Z$/` plus `!Number.isNaN(Date.parse(dep))`), or validate via the engine/parser. If fractional seconds are intentionally disallowed in the UI, document that and align the SDK too; today they silently disagree. |
| 🟡 Medium | DOCS-EXPORT-01 | build-ci | `scripts/docs-export.mjs:36-51` | Manifest hash depends on locale-sensitive sort; plus 6 more findings | Sort by relative path with a locale-independent comparator. Also: refresh/expand REFERENCE_FILES, guard the fs.readFile, fail-loud on prettier errors and escape icon/name/domain, assert known categories, and harden the issue-opener dry-run. |
| 🟡 Medium | RDOC-02 | docs-mismatch | `tracking/iana/EVIDENCE_ANNEX.md:29, 31` | EVIDENCE_ANNEX.md tells IANA reviewers 'current deployed version is aid1' — false since v2 shipped | Update the Core Claim to state the current deployed version is `aid2` (with `aid1` as a legacy compatibility version), and refresh the 'Evidence From the Current Web Adapter' / 'Generated Type Surface' sections accordingly. The _agent label-stability thesis can be kept and reinforced. |
| ⚪ Low | EXP-01 | docs-mismatch | `packages/docs/specification_v2_explained.md:242-258` | Threat model section 3.2 omits the unauthorized-association threat and its domain-binding mitigation | Add an Unauthorized association mitigation bullet referencing Appendix B.7 (matching specification.md:224), or strengthen the superseded banner. |
| ⚪ Low | EXP-04 | docs-mismatch | `packages/docs/specification_v2_explained.md:473-482` | B.4 Covered Components presents a closed four-component set, contradicting the now-optional aid-domain component | Note that the covered set may optionally include aid-domain;req between @authority and @status (matching specification.md:514), or supersede the appendix. |
| ⚪ Low | EXP-05 | docs-mismatch | `packages/docs/specification_v2_explained.md:498-513` | B.6 Verifier Summary omits the domain-binding acceptance, fail-closed, and indicator rules | Extend B.6 to accept the optional aid-domain-covered shape and add the fail-closed reject and domain-binding-indicator obligations (matching specification.md B.7 items 1-5), or supersede. |
| ⚪ Low | EXP-09 | docs-mismatch | `packages/docs/specification_v2_explained.md:11-22` | Front-matter and header dates ('23 May 2026' / tag 2026-05-23) misrepresent the currency of a live page | If retained, update the dateline to mark this as frozen historical content and note the spec moved on (superseded by specification.md as of 2026-06-14, which added the domain-binding profile). |
| ⚪ Low | WEB-AIDGEN-004 | dead-code | `packages/web/src/lib/aid-generator.ts:1-53` | aid-generator.ts is orphaned/dead production code with a second divergent TXT builder+validator | Delete packages/web/src/lib/aid-generator.ts and its test, consolidating on core.ts (or on the engine). Before deleting, port the `i`/`kid` rejection (aid2 disallows kid) into core.ts so the live Generator surfaces it, matching SDK parser.ts:319-322 which throws on kid in aid2. |
| ⚪ Low | OG-1 | security | `packages/web/src/app/api/og/docs/route.tsx:10-15, 65, 73` | OG image route renders unbounded, unclamped user-supplied query params (public, unauthenticated) | Clamp each param to a sane max length before rendering (e.g. title.slice(0, 120), description.slice(0, 200), slug.slice(0, 100)) and add `overflow:'hidden'`, `textOverflow:'clip'` (and a `maxHeight`) on the title/description containers so long input cannot break layout or blow up render cost. Optionally reject/normalize slug to `[A-Za-z0-9/_-]` since it is interpolated into the displayed URL string at line 73. |
| ⚪ Low | OG-2 | test-gap | `packages/web/src/app/api/og/docs/route.tsx:10` | OG image route has no test coverage | Add a small route unit test that invokes GET with (a) no params (asserts defaults 'Documentation'/'Agent Identity & Discovery'), (b) normal params, and (c) oversized params (asserts the clamp introduced for OG-1), checking status 200, content-type image/png, and the Cache-Control header. |
| ⚪ Low | WEBCFG-1 | docs-mismatch | `packages/web/WORKBENCH_COMPONENTS_2.md:9` | WORKBENCH_COMPONENTS_2.md protocol list omits the `ucp` (Universal Commerce Protocol) token | Add `UCP` to the protocol list in the WORKBENCH_COMPONENTS_2.md Overview (line 9) so it matches the eight/nine tokens registered in src/lib/protocols/index.ts. Consider deriving such lists from constants to prevent drift. |
| ⚪ Low | WEBCFG-2 | security | `packages/web/next.config.js:94-118` | next.config.js security-header block omits HSTS and Content-Security-Policy | Consider adding `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` and a baseline `Content-Security-Policy` to the headers() array (or confirm HSTS is enforced at the Cloudflare edge and document that in the file comment). At minimum, document the intentional omission so future reviewers do not re-flag it. |
| ⚪ Low | RBT-01 | build-ci | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/tsconfig.base.json:2-13` | tsconfig.base.json is missing exactOptionalPropertyTypes (CLAUDE.md mandate) and is never extended by any package | Either (a) add `"exactOptionalPropertyTypes": true` and `"noImplicitAny": true` to tsconfig.base.json AND make packages extend it (consolidating root tsconfig.json into base), or (b) if base is intentionally dead, delete tsconfig.base.json and drop the turbo.json line 22 cache input. As-is it is a misleading file: its name implies it is the shared base, but it carries weaker flags than the root tsconfig that packages actually extend, and it omits the documented mandate. |
| ⚪ Low | RBT-02 | type-safety | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/web/tsconfig.json:2-29` | packages/web is excluded from every tsconfig that enforces exactOptionalPropertyTypes, so the web app is not held to the CLAUDE.md type-strictness mandate | Add `"exactOptionalPropertyTypes": true` to packages/web/tsconfig.json (or have it extend the shared base once RBT-01 is resolved), then fix any resulting type errors. If web is intentionally exempt, document that exemption in CLAUDE.md so the mandate is not stated as repo-wide. |
| ⚪ Low | RBT-03 | dead-code | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/packages/aid-engine/tsup.config.bundled_0d0kugbprslq.mjs:1-24` | Two tsup-generated bundle artifacts are committed to git with no .gitignore rule | `git rm packages/aid-engine/tsup.config.bundled_*.mjs` and add a rule such as `**/tsup.config.bundled_*.mjs` (or `*.bundled_*.mjs`) to .gitignore. Confirm a fresh `pnpm -C packages/aid-engine build` regenerates and does not depend on the committed copies. |
| ⚪ Low | RDOC-03 | docs-mismatch | `.github/CLI_GITHUB.md:29-30` | CLI_GITHUB.md Optimization Matrix mislabels Parity/Security triggers as path-filtered, contradicting both the workflows and the doc's own thesis | Update the Parity Check row to 'Runs on all PRs and pushes to tracked branches (no path filter)' to match ci-parity.yml and the rest of the matrix. Verify the Security Scan diff/full description still matches security.yml (which also has no paths filter; the diff-vs-full distinction is mode logic inside the job, so that row is acceptable but worth confirming). |
| ⚪ Low | RDOC-04 | docs-mismatch | `.github/CONTRIBUTING-spec.md:20-24, 1-12` | CONTRIBUTING-spec.md overstates CI enforcement (alphabetical sort) and omits the changeset + docs:verify steps required by AGENTS.md/CLAUDE.md | Reword the alphabetical-sort line to a convention ('keep token keys sorted for clean diffs') rather than a CI-failure claim, or point it at the gen-check that actually runs. Add steps for `pnpm changeset` (user-visible changes) and, for any packages/docs/** edits, `pnpm docs:verify` + committing the regenerated export-manifest.{json,sha256}, consistent with AGENTS.md 'Docs export manifest' and CLAUDE.md. |
| ⚪ Low | RDOC-05 | docs-mismatch | `tracking/POST_RELEASE_TODO.md:1-3, 54, 68` | POST_RELEASE_TODO.md is anchored to v1.0.0 and v=aid1 enforcement, now superseded by v2 | Optional refresh: note at the top that this roadmap predates v2 and that schema/enforcement items now target `v=aid2`; or mark it historical. Low priority — it does not gate any user/contributor workflow. |
| ⚪ Low | showcase-1 | docs-mismatch | `showcase/terraform/README.md:114` | README §7.2 claim 'every protocol token has a representative showcase record' is false — websocket and zeroconf are missing | Either soften the wording to 'each network-facing protocol token used in the showcase has a representative record' / 'most protocol tokens have a representative record', or add websocket and zeroconf showcase records to protocol/examples.yml and regenerate. The 7-token parenthetical is itself accurate; only the absolute claim 'every protocol token' is wrong. |
| ⚪ Low | showcase-2 | docs-mismatch | `showcase/terraform/README.md:62` | README variable table cites wrong spec section (§2.4) for the protocol-specific examples — should be §2.5; contradicts the same README and main.tf | Change '§2.4' to '§2.5' on README line 62 to match main.tf, the rest of the README (line 112), and the actual spec section title 'Protocol-Specific Names'. |
| 🔵 Info | EXP-06 | docs-mismatch | `packages/docs/specification_v2_explained.md:184-185` | Client Discovery Algorithm (steps 8-9) omit the SHOULD-default AID-Domain request and domain-binding indicator | Update 2.3 to note clients SHOULD send AID-Domain by default and return the domain-binding indicator (matching specification.md:139-140), or supersede. |
| 🔵 Info | RDOC-06 | docs-mismatch | `DOCS_RENDERER_PLAN.md:6-8, 402-404, 538-577` | DOCS_RENDERER_PLAN.md is a completed implementation plan with stale paths/labels left at repo root | Consider moving DOCS_RENDERER_PLAN.md into tracking/plans/ (or deleting) now that the renderer shipped, so a stale 'v1.1' spec label and obsolete route map don't sit at the repo root where they read as current. Info-only. |
| 🔵 Info | showcase-3 | docs-mismatch | `showcase/terraform/README.md:112` | README §2.5 title quoted as 'Multiple Protocols And Protocol-Specific Compatibility Names' — actual spec title is 'Protocol-Specific Names' | Update the quoted title to 'Protocol-Specific Names' to match specification.md §2.5 exactly. |

## Round-2 dismissed (sample)

| Sev | ID | Category | Location | Issue | Fix |
|---|---|---|---|---|---|
| ⚪ Low | WEB-CORE-002 | parity | `packages/web/src/lib/generator/core.ts:38-95` | core.ts validate() never validates the auth token against the registry (drift vs SDK) | Add an auth-token check mirroring the SDK: import/inline the AUTH_TOKENS keys and push `{ code: 'ERR_AUTH_TOKEN', message: 'Invalid auth token' }` when `data.auth` is set and not in the registry. Better, retire the bespoke validator and validate by round-tripping the built TXT through the engine/SDK parser to eliminate the drift class entirely. |
| 🔵 Info | WEB-CORE-005 | parity | `packages/web/src/lib/generator/core.ts:84-86` | core.ts validate() omits aid2 kid/i rejection and pka 32-byte-vs-SDK alignment edge | If round-trip paste/edit of legacy records is a real flow, add an explicit ERR for any `i`/`kid` token detected in parseRecordString input so the UI matches SDK rejection semantics. Otherwise document that the web generator silently ignores legacy keys. |
| 🔵 Info | WEB-REDUCER-006 | correctness | `packages/web/src/hooks/chat-engine/reducer.ts:9-31` | Reducer drops unknown actions silently and lacks state-machine guards (acceptable but worth noting) | No change required for correctness. Optionally harden uniqueId with a monotonic counter to remove the theoretical id-collision path that could mis-target REPLACE_MESSAGE, and consider asserting/logging in the reducer default branch during development to catch action drift early. |
| 🔵 Info | PKA-GEN-1 | correctness | `packages/web/src/components/ui/pka-key-generator.tsx:44, 176-180` | PKA key generator crypto is sound — no defect found (positive confirmation) | No change required. (Optional, non-blocking: the generator/validator have no unit test, but thumbprint parity is already enforced by the SDK conformance vectors and aid-conformance runner.) |
| 🔵 Info | WEBCFG-3 | docs-mismatch | `packages/web/CHANGELOG.md:8` | CHANGELOG.md references @agentcommunity/aid@1.0.0 while the SDK is now 2.0.0 (historical entry, package is private/unpublished) | No action required for correctness. If desired for tidiness, the next `pnpm changeset version` run will append current entries; the historical 1.0.0 line should remain as-is (rewriting changelog history is not warranted). |
| 🔵 Info | RBT-04 | docs-mismatch | `/Users/team/dev/PROJECTS/AgentCommunity/AID/.claude/worktrees/hardcore-almeida-0de44d/protocol/pka_vectors.json:2` | protocol/pka_vectors.json still declares version:1 after the v2 + domain-bound vectors were added | Low-priority hygiene: either bump `"version"` to 2 to reflect the v2/domain-bound additions (safe — no consumer asserts the old value), or add a one-line comment/spec note documenting that the field is a non-asserted format marker so future readers do not assume it tracks the AID protocol version. Do not bump without a note if any future consumer might start gating on it. |


---

## Combined coverage statement

Round 1 opened 354 distinct files; Round 2 closed the 52 flagged gaps. **All source code (every package), all 110 tracked markdown docs, all build/CI config, the protocol source-of-truth, and the showcase terraform are now reviewed.** Remaining un-opened tracked files are non-substantive (lockfiles, generated `.next` artifacts, binary assets). Combined confirmed findings: **146** (1 critical, 9 high, 44 medium, 72 low, 20 info).
