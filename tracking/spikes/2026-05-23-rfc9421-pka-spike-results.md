# RFC 9421 AID v2 PKA Spike Results

**Date:** 2026-05-23
**Status:** Passed with caveats
**Worktree:** `/Users/team/dev/PROJECTS/AgentCommunity/AID/.worktrees/aid-v2-spec-plan`

**Follow-up:** After controller review, signed HTTP `Date` was re-tested as a likely removal for closer Web Bot Auth alignment. See `tracking/spikes/2026-05-23-rfc9421-pka-no-date-respike-results.md`.

## Question

Can AID v2 define a precise RFC 9421 response signature for PKA that binds:

- the client challenge from the request
- the request method
- the request target URI
- the request authority
- the response status
- response freshness
- derived JWK-thumbprint `keyid`
- Ed25519 algorithm semantics

## Candidate Signature-Input

```http
Signature-Input: aid-pka=("aid-challenge";req "@method";req "@target-uri";req "@authority";req "@status" "date");created=<unix>;expires=<unix>;keyid="<jwk-thumbprint>";alg="ed25519";tag="aid-pka-v2"
Signature: aid-pka=:<base64-signature>:
```

## Results

| Requirement                                   | Candidate behavior                                                       | Result                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Request challenge bound to response signature | `"aid-challenge";req` is in the signature base                           | PASS                                                           |
| Request method bound                          | `"@method";req` is in the signature base                                 | PASS                                                           |
| Request URI bound                             | `"@target-uri";req` is in the signature base                             | PASS                                                           |
| Request authority bound                       | `"@authority";req` is in the signature base                              | PASS                                                           |
| Response status bound                         | `"@status"` is in the signature base without `;req`                      | PASS                                                           |
| Response freshness header bound               | `"date"` is in the signature base                                        | PASS for binding; freshness policy still needs Appendix D text |
| Signature freshness parameters present        | `created` and `expires` are present                                      | PASS                                                           |
| Key identity bound                            | `keyid` is the RFC 7638 JWK thumbprint derived from DNS `k`              | PASS                                                           |
| Algorithm semantics bound                     | `alg` has semantic value `ed25519`; verifier compares case-insensitively | PASS                                                           |

Command history:

```text
$ pnpm -C packages/aid exec vitest run src/pka.rfc9421-spike.test.ts
undefined
ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "vitest" not found
```

The first attempt failed because the worktree did not have dependencies installed.

```text
$ pnpm install --frozen-lockfile --ignore-scripts
WARN Failed to create bin at .../packages/e2e-tests/node_modules/.bin/aid-doctor. ENOENT: no such file or directory, open '.../packages/aid-doctor/dist/cli.js'
Done in 5.7s using pnpm v10.12.1
```

The install used the existing lockfile and did not change tracked files. The warning is from a missing built `packages/aid-doctor/dist/cli.js` bin target while scripts were disabled; it did not block the AID package spike.

```text
$ pnpm -C packages/aid exec vitest run src/pka.rfc9421-spike.test.ts
RUN  v2.1.9 .../packages/aid
✓ src/pka.rfc9421-spike.test.ts (4 tests) 4ms
Test Files  1 passed (1)
Tests  4 passed (4)
Duration  291ms
```

Construction caveat: this was a disposable signature-base spike. It directly constructs the intended RFC 9421 signature base and verifies Ed25519 over those bytes. It does not prove interoperability with an independent RFC 9421 parser or canonicalization library. No RFC-shape concern was found in the candidate mapping itself, but Appendix D still needs precise profile text for Date freshness policy, URI/authority normalization, and `alg` reconstruction semantics.

## Superseded Accepted Shape

This was the accepted shape from the first spike. It is superseded by the no-date re-spike in `tracking/spikes/2026-05-23-rfc9421-pka-no-date-respike-results.md`, which recommends moving the client challenge into RFC 9421 `nonce` and removing signed HTTP `Date`.

The first-spike AID v2 PKA response signature was:

```http
Signature-Input: aid-pka=("aid-challenge";req "@method";req "@target-uri";req "@authority";req "@status" "date");created=<unix>;expires=<unix>;keyid="<jwk-thumbprint>";alg="ed25519";tag="aid-pka-v2"
Signature: aid-pka=:<base64-signature>:
```

The signature base contains these lines in order:

```text
"aid-challenge";req: <AID-Challenge request header value>
"@method";req: GET
"@target-uri";req: <absolute discovered URI>
"@authority";req: <authority of discovered URI>
"@status": 200
"date": <HTTP Date response header>
"@signature-params": ("aid-challenge";req "@method";req "@target-uri";req "@authority";req "@status" "date");created=<unix>;expires=<unix>;keyid="<jwk-thumbprint>";alg="ed25519";tag="aid-pka-v2"
```

Verifier policy:

- `keyid` is compared to the RFC 7638 JWK thumbprint derived from DNS `k`.
- `alg` comparison is case-insensitive and must have semantic value `ed25519`.
- `expires` is mandatory.
- `expires` must be greater than `created`.
- current verifier time must be `created <= now <= expires`, with only a small local clock-skew tolerance if implementers choose one.

## Rejected Alternatives

- Do not sign only the nonce. It fails to bind request target, response status, and response freshness.
- Do not use DNS `kid`. AID v2 derives `keyid` from DNS `k`.
- Do not make `expires` optional. Without `expires`, replay policy is underspecified.
- Do not use exact-case `alg` matching. AID v2 preserves existing case-insensitive Ed25519 comparison.
- Do not put key rotation or directory semantics into the PKA handshake.

## Superseded Spec Text Implications

These implications are historical output from the first spike and are superseded by the no-date re-spike in `tracking/spikes/2026-05-23-rfc9421-pka-no-date-respike-results.md`.

The first spike concluded that Appendix D could define one response signature labeled `aid-pka` whose covered components were exactly `"aid-challenge";req`, `"@method";req`, `"@target-uri";req`, `"@authority";req`, `"@status"`, and `"date"` in that order. Request-derived components used `;req`; response-derived `@status` and `date` did not.

The `Signature-Input` parameters are normative protocol surface for v2. Verifiers must require `created`, `expires`, `keyid`, `alg`, and `tag="aid-pka-v2"`. The expected `keyid` is derived from DNS `k` by RFC 7638 JWK thumbprint over the Ed25519 OKP JWK `x` value. The `alg` parameter must compare case-insensitively to the semantic value `ed25519`.

Verifier rejection rules should include missing or differently ordered required covered components, missing `expires`, `expires <= created`, verifier time outside the accepted `created` to `expires` window, `keyid` mismatch, non-Ed25519 `alg`, wrong `tag`, failed Ed25519 verification, or any attempt to use DNS `kid`/`i` as the v2 key identity.

Migration impact: this shape is a v2 wire-format break from the current SDK PKA construction because it derives `keyid` from DNS `k`, requires `expires`, binds request components with `;req`, includes response `@status`, and uses the `aid-pka-v2` tag. Existing exact-case `alg` failures should not be introduced; the v2 spec should preserve case-insensitive Ed25519 comparison.

## Questions Before Appendix D

1. Date policy: Should Appendix D require `Date` to be present and parseable only, or also require it to fall within the `created`/`expires` window or a verifier clock-skew window? The spike proves `date` is signed; it does not choose the freshness policy.
2. URI and authority canonicalization: Appendix D must define how clients and servers derive `@target-uri` and `@authority` from the discovered URI, especially for default ports, explicit ports, redirects, and reverse-proxy deployments.
3. Algorithm parameter handling: Signers should emit `alg="ed25519"` for consistency, while verifiers may compare the semantic value case-insensitively. Verifiers must reconstruct `@signature-params` from the received Structured Field value, not from a lowercased normalized replacement.
4. Independent interop check: Before SDK implementation, create at least one canonical v2 PKA vector and verify it with an independent RFC 9421 parser/canonicalization implementation.
