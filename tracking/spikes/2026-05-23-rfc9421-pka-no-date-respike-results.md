# RFC 9421 AID v2 PKA No-Date Re-Spike Results

**Date:** 2026-05-23
**Status:** Passed with caveats
**Worktree:** `/Users/team/dev/PROJECTS/AgentCommunity/AID/.worktrees/aid-v2-spec-plan`

## Question

After deciding that signed HTTP `Date` should likely be removed for closer Web Bot Auth alignment, can AID v2 define a coherent RFC 9421 response signature shape without a covered `date` response header?

This re-spike tested two no-date candidates:

- Candidate A keeps the client challenge in the request header component `"aid-challenge";req`.
- Candidate B moves the client challenge into the standard RFC 9421 `nonce` signature parameter.

Both candidates keep AID DNS key shape as `k=<base64url Ed25519 public key>`, exactly the JWK `x` value. The `keyid` is the RFC 7638 JWK thumbprint derived from:

```json
{ "crv": "Ed25519", "kty": "OKP", "x": "<k>" }
```

## Command History

```text
$ pnpm -C packages/aid exec vitest run src/pka.rfc9421-no-date-respike.test.ts
RUN  v2.1.9 .../packages/aid
✓ src/pka.rfc9421-no-date-respike.test.ts (4 tests) 4ms
Test Files  1 passed (1)
Tests  4 passed (4)
Duration  248ms
```

Dependencies were already installed, so the existing package exec path was used.

```text
$ test ! -e packages/aid/src/pka.rfc9421-no-date-respike.test.ts && printf 'temporary test file removed\n'
temporary test file removed
```

The disposable test file was deleted after the run:

```text
packages/aid/src/pka.rfc9421-no-date-respike.test.ts
```

## Candidate A

```http
Signature-Input: aid-pka=("aid-challenge";req "@method";req "@target-uri";req "@authority";req "@status");created=<unix>;expires=<unix>;keyid="<jwk-thumbprint>";alg="ed25519";tag="aid-pka-v2"
Signature: aid-pka=:<base64-signature>:
```

Signature base used by the spike:

```text
"aid-challenge";req: <AID-Challenge request header value>
"@method";req: GET
"@target-uri";req: <absolute discovered URI>
"@authority";req: <authority of discovered URI>
"@status": 200
"@signature-params": ("aid-challenge";req "@method";req "@target-uri";req "@authority";req "@status");created=<unix>;expires=<unix>;keyid="<jwk-thumbprint>";alg="ed25519";tag="aid-pka-v2"
```

| Requirement                            | Candidate A behavior                                        | Result |
| -------------------------------------- | ----------------------------------------------------------- | ------ |
| Removes signed HTTP `Date`             | `date` is not a covered response component                  | PASS   |
| Request challenge bound                | `"aid-challenge";req` is in the signature base              | PASS   |
| Request method bound                   | `"@method";req` is in the signature base                    | PASS   |
| Request URI bound                      | `"@target-uri";req` is in the signature base                | PASS   |
| Request authority bound                | `"@authority";req` is in the signature base                 | PASS   |
| Response status bound                  | `"@status"` is in the signature base without `;req`         | PASS   |
| Signature freshness parameters present | `created` and `expires` are present                         | PASS   |
| Key identity bound                     | `keyid` is the RFC 7638 JWK thumbprint derived from DNS `k` | PASS   |
| Rejects changed client challenge       | Verification fails when `AID-Challenge` changes             | PASS   |
| Rejects changed response status        | Verification fails when `@status` changes                   | PASS   |

Candidate A is coherent as an RFC 9421 profile and preserves the earlier AID-specific request-header challenge model while avoiding fragile HTTP `Date` binding.

## Candidate B

```http
Signature-Input: aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created=<unix>;expires=<unix>;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
Signature: aid-pka=:<base64-signature>:
```

Signature base used by the spike:

```text
"@method";req: GET
"@target-uri";req: <absolute discovered URI>
"@authority";req: <authority of discovered URI>
"@status": 200
"@signature-params": ("@method";req "@target-uri";req "@authority";req "@status");created=<unix>;expires=<unix>;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
```

Verifier policy tested by the spike:

- The verifier reconstructs the signature base from the received `nonce`.
- The verifier rejects the response if `nonce` does not equal the client challenge it sent.

| Requirement                            | Candidate B behavior                                            | Result |
| -------------------------------------- | --------------------------------------------------------------- | ------ |
| Removes signed HTTP `Date`             | `date` is not a covered response component                      | PASS   |
| Client challenge bound                 | `nonce` is in `@signature-params`, which is signed              | PASS   |
| Verifier challenge comparison          | Verifier compares `nonce` to the challenge it sent              | PASS   |
| Request method bound                   | `"@method";req` is in the signature base                        | PASS   |
| Request URI bound                      | `"@target-uri";req` is in the signature base                    | PASS   |
| Request authority bound                | `"@authority";req` is in the signature base                     | PASS   |
| Response status bound                  | `"@status"` is in the signature base without `;req`             | PASS   |
| Signature freshness parameters present | `created` and `expires` are present                             | PASS   |
| Key identity bound                     | `keyid` is the RFC 7638 JWK thumbprint derived from DNS `k`     | PASS   |
| Rejects changed client challenge       | Verification fails when `nonce` differs from the sent challenge | PASS   |
| Rejects changed response status        | Verification fails when `@status` changes                       | PASS   |

Candidate B is coherent as an RFC 9421 profile and more directly matches Web Bot Auth examples that rely on `created`, `expires`, `keyid`, `alg`, `tag`, and often `nonce`, rather than a signed HTTP `Date` header.

## Comparison Recommendation

Prefer Candidate B for AID v2 Appendix D.

Reasons:

- Better Web Bot Auth alignment: the challenge uses RFC 9421 `nonce`, a standard signature parameter already visible in WBA-style examples, instead of an AID-specific covered request header.
- Simpler operational profile: no signed HTTP `Date`, so reverse proxies and intermediaries are less likely to break verification by inserting, normalizing, or replacing response date headers.
- Clear replay model: freshness is carried by mandatory signed `created` and `expires`, while one-shot challenge binding is carried by signed `nonce` plus verifier-side equality against the challenge it sent.
- Smaller covered-component set: the request/response binding stays focused on method, target URI, authority, and status. The client challenge is still signed through `@signature-params`.

Candidate A remains viable if AID v2 deliberately wants the client challenge to be a covered request header. The tradeoff is that it keeps an AID-specific challenge mechanism in the covered-component list when RFC 9421 already has `nonce` for this purpose.

Construction caveat: this was a disposable signature-base spike. It directly constructed the intended RFC 9421 signature base and verified Ed25519 over those bytes. It did not prove interoperability with an independent RFC 9421 parser or Structured Fields implementation.

## Adopted Answers After Review

These answers were folded into the active v2 plan after the no-date re-spike and three grounded review agents:

1. Nonce syntax and size: use at least 32 bytes of entropy, encoded as unpadded base64url for transport, and compare the received `nonce` exactly to the challenge sent by the verifier.
2. Nonce replay policy: do not require server-side nonce storage in v2 core. The verifier-generated one-shot nonce, exact echo comparison, short expiry, and `Cache-Control: no-store` are the replay controls.
3. Challenge transport: prefer RFC 9421 `Accept-Signature` with `nonce`; validate the exact Structured Fields serialization before Appendix D is frozen.
4. Cache policy: require PKA responses to include `Cache-Control: no-store`; clients should also send `Cache-Control: no-store` on the PKA request.
5. Expiry window: `expires - created` must be no more than 300 seconds and should be no more than 60 seconds.
6. URI and authority canonicalization: reject redirects; use the discovered endpoint request URI with fragments removed and query preserved; derive `@authority` from the externally visible authority, with lowercased hostname, default port omitted, and non-default port retained.
7. Independent interop check: before SDK implementation, create at least one canonical v2 PKA vector and verify it with an independent RFC 9421 parser/canonicalization implementation.
