# AID v2 Spec Plan

> **For agentic workers:** This is a research-phase spec and implementation plan. Do not implement SDK changes from this file until the v2 spec text and open decisions are reviewed. When implementation starts, use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task by task.

**Goal:** Produce a circulatable AID v2 spec draft that defines AID as the first-contact endpoint-and-key anchor while cleaning up PKA key encoding, key identity, and migration from `aid1`.

**Current recommendation:** Ship v2 core as one valid `aid2` TXT record per queried DNS name, `k`/`pka` as unpadded base64url Ed25519 JWK `x`, no DNS `kid`/`i`, no `prev`, no multi-key RRset, and HTTP Message Signature `keyid` derived from `k` as the RFC 7638 JWK SHA-256 thumbprint. Appendix D should use a WBA-aligned RFC 9421 response signature with no signed HTTP `Date`, a client challenge carried in the RFC 9421 `nonce` parameter, `created` + mandatory `expires`, and `Cache-Control: no-store` on PKA responses.

**Inputs preserved:** The historical `v2-change-plan.md` and `v2-design-plan.md` remain design-history context, including superseded `prev`/`x` rotation-chain ideas. The current design input is `/Users/team/dev/PROJECTS/AgentCommunity/RESEARCH/AID_UPGRADE/v2-change-plan-v2.md`, plus the no-date RFC 9421 re-spike at `tracking/spikes/2026-05-23-rfc9421-pka-no-date-respike-results.md`.

**Positioning sentence for spec reviewers:** AID is the first-contact endpoint-and-key anchor: DNS publishes the current endpoint and the current Ed25519 public key; everything else, including rotation, attestation, request provenance, and organizational identity, composes on top.

**Shareable preview artifact:** `packages/docs/specification_v2_explained.md` is the current human-review draft. It is intentionally separate from `packages/docs/specification.md`, which remains the current v1.2 normative spec for comparison. Future agents should update this preview when decisions change, and only replace `specification.md` when the team deliberately moves from review artifact to v2 spec PR.

---

## Executive Recommendation

Keep v2 focused on key identity cleanup, not rotation infrastructure:

- Do `k`/`pka` base64url cleanup now.
- Do derived RFC 7638 `keyid` now.
- Remove DNS `kid`/`i` now.
- Preserve current case-insensitive `alg` handling while requiring the semantic value `ed25519`.
- Tighten Appendix D so it defines an actual RFC 9421 response-signature profile, not just a conceptual Ed25519 check.
- Use RFC 9421 `nonce` for the client challenge and drop signed HTTP `Date` from the PKA signature base.
- Prefer RFC 9421 `Accept-Signature` as the challenge transport, rather than inventing another AID-specific response-signature negotiation mechanism.
- Require `Cache-Control: no-store` on nonce-bound PKA responses unless a later review defines an exact and equally safe cache-varying rule.
- Require at least 32 bytes of nonce entropy, encoded as unpadded base64url and compared exactly by the verifier.
- Require `expires - created` to be short: **MUST** be no more than 300 seconds and **SHOULD** be no more than 60 seconds.
- Reject redirects during PKA; verify the discovered endpoint URI rather than a redirected final URI.
- Keep one valid `aid2` DNS record in v2 core.
- Recommend against adding `prev`, selectors, validity windows, or any DNS-level key-rotation mechanism to v2 core.
- Current recommendation excludes multi-key RRsets from v2 core; the `AidKeySet` alternative is documented as a deferred larger redesign.
- If AID later needs managed rotation, define it in an HTTP key-directory/profile layer using JWKS/WBA-style overlap.

Reason: key rotation is an operational key-management problem. WBA, OAuth/OIDC JWKS, DKIM selectors, webhook signing, and TLS all handle rotation through key directories, selectors, validity windows, or certificate replacement outside the minimal discovery record. AID v2 core should honestly state: DNS currently publishes this endpoint and this key. If that key changes, returning clients apply local pinning/downgrade policy. AID core should stop pretending v1 `kid` solved rotation, clean up key identity, and leave real overlap to a future key-directory profile.

Scope honesty: this is more than a key-encoding refactor. The plan bundles a new v2 PKA HTTP Message Signatures profile, a mandatory `expires` requirement, dual-version discovery partitioning, trust-source state, and an explicit restatement of the ambiguity rule. Those are defensible v2 changes, but they must be reviewed as protocol surface, not presented as a mechanical encoding cleanup.

## Decision Log From Grounded Review

These notes capture why the current plan changed after the 2026-05-23 RFC 9421/WBA, Pkarr/DNS/JWK, and auth.md ecosystem reviews.

### Keep `k`, Not `x`

AID keeps `k` as the DNS field name. The value of `k` is exactly the RFC 8037 JWK `x` member for the same Ed25519 public key.

Rationale:

- `x` is a JWK member name, not a clear DNS TXT field name.
- The old `prev` rotation-chain proposal used `x` as a short alias for a previous-key signature; reusing `x` for key material would preserve avoidable confusion.
- WBA/JWKS alignment depends on the value being JWK `x`, not on the DNS field being named `x`.
- `k=<jwk-x-value>` keeps the DNS record readable while making conversion to JWK mechanical.

### Pkarr Alignment Boundary

AID v2 remains compatible with the Pkarr-inspired idea of compact Ed25519 key material, but it is not adopting the Pkarr identity model.

Pkarr makes the public key the address and signs DNS packets under that key. AID remains DNS-authority-rooted: the DNS owner publishes the current endpoint and the current endpoint-proof key inside a TXT payload. Reviewer-facing text should say "DNS-current endpoint/key" and must not imply Pkarr-style self-certifying names, key-addressed identity, or cryptographic continuity across key changes.

### WBA Alignment Boundary

AID v2 should follow WBA where the layers match:

- Ed25519.
- RFC 9421 HTTP Message Signatures.
- RFC 7638 JWK thumbprint as `keyid`.
- `created`, `expires`, `nonce`, and `tag` signature parameters.
- No signed HTTP `Date` in the PKA profile unless a later reviewer gives a concrete reason.

AID should not become WBA. WBA signs automated client requests to origins; AID PKA is endpoint proof for a DNS-discovered agent endpoint. Operators may reuse the same key material where their threat model allows it, but the spec should not recommend reuse because it intentionally shares blast radius between endpoint proof and any high-volume request-signing use.

### PKA Response Profile Decision

The no-date re-spike and subsequent review settle the v2 PKA profile direction:

- The client challenge is an RFC 9421 `nonce`, requested through `Accept-Signature` if that final syntax validates cleanly.
- The nonce value should be generated from at least 32 random bytes and encoded as unpadded base64url. Verifiers compare the received `nonce` value exactly to the value they sent.
- A server-side nonce database is not required in v2 core because the verifier generated the one-shot challenge and the response is not a reusable bearer artifact. Short expiry and `no-store` are the replay controls.
- `created` and `expires` are mandatory. The maximum response window is 300 seconds; implementations should use 60 seconds or less where clock behavior permits it.
- Clients may allow small clock skew when checking `created` and `expires`; the spec text should recommend approximately 30 seconds, not leave this undefined.
- PKA follows the discovered endpoint URI. Redirects during PKA are rejected, because allowing redirects changes the authority being proven and creates proxy/canonicalization ambiguity.
- `@target-uri` is derived from the actual PKA request to the discovered `u` value, with fragments removed and query preserved.
- `@authority` is derived from the externally visible request authority. Hostnames are lowercased, default ports are omitted, and non-default ports are retained.
- Reverse-proxy deployments must sign the externally visible scheme, authority, and URI, not internal hop-local values.
- `@status` signs the response status that was actually returned. The response does not have to be `200`; this allows signed `401` responses that hand off to OAuth/auth.md discovery without weakening endpoint proof.
- Signers emit `alg="ed25519"` lowercase; verifiers preserve the exact Structured Field value for signature-base reconstruction while comparing the semantic algorithm value case-insensitively.

The remaining work is not another design debate over date vs nonce. It is to validate exact `Accept-Signature` serialization against RFC 9421 Structured Fields and produce a canonical vector before SDK implementation.

### auth.md Support Boundary

AID v2 core can support auth.md without adding auth.md fields.

The clean handoff is:

1. AID resolves a domain to `u` and `p`.
2. If `k` is present, AID PKA verifies that the endpoint controls the DNS-published key.
3. The client then follows the endpoint/protocol/OAuth layer: RFC 9728 Protected Resource Metadata, RFC 8414 Authorization Server Metadata, and auth.md's `agent_auth` registration flow where present.

AID v2 core must not add `agent_auth`, PRM URLs, AS metadata URLs, ID-JAG fields, issuer lists, credential types, scopes, trust lists, SPIFFE bundle endpoints, or WIMSE trust-domain mappings. A future auth hint such as `a=oauth2_agent_auth` should wait for adoption pressure and must remain advisory if added.

## Scope Boundary

In v2 core:

- TXT at `_agent.<domain>` remains canonical unless the label decision changes separately.
- Required fields remain `v`, `u`/`uri`, and `p`/`proto`.
- Optional metadata remains `a`/`auth`, `s`/`desc`, `d`/`docs`, and `e`/`dep`.
- Optional PKA remains `k`/`pka`, but its encoding changes.
- `.well-known/agent` remains a fallback, but it must be marked as TLS-hosted fallback trust, not DNS-rooted trust.

Out of v2 core:

- `prev` or signed rotation chains.
- Multi-key DNS overlap or any active-key-set RRset semantics in the current recommendation; see the deferred `AidKeySet` alternative below.
- PKA-Extended, request-origin signatures, DID-like metadata, WIMSE/SPIFFE/OAuth binding profiles.
- Authority keys, sequence numbers, validity windows, blockchain/IPFS/transparency logs, capability schemas.

Non-normative composition guardrail: AID v2 core may be referenced by future WIMSE/SPIFFE/OAuth profiles as a public first-contact endpoint-and-key anchor, but AID v2 core does not define WIMSE trust-domain mapping, SPIFFE bundle federation, OAuth client registration, request provenance, or organizational identity.

## Rotation Stance

AID v2 core does not solve cryptographic key rotation.

The v2 core statement is:

```text
_agent.acme.com TXT "v=aid2;p=mcp;u=https://agent.acme.com/mcp;k=<current-key>"
```

That means:

- DNS currently publishes this endpoint and this key.
- The endpoint can prove possession of the corresponding private key.
- A verifier can derive stable key identity from `k`.

It does not mean:

- The new key is cryptographically authorized by the old key.
- The key has a DNS-level validity window.
- Multiple endpoint keys are active through DNS.
- AID core provides delegated request-signing infrastructure.

If the key changes, the key changed. Clients with previous state decide whether to warn, fail, or accept according to local policy.

If AID later needs stronger rotation for pinned clients, enterprise policy, delegated request-origin keys, or provenance profiles, use an HTTP key-directory profile:

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "<jwk-thumbprint>",
      "x": "<public-key>",
      "use": "sig",
      "nbf": 1712793600,
      "exp": 1715385600
    }
  ]
}
```

That profile can use normal JWKS/WBA-style overlap: add the new key before use, keep the old key through the overlap window, remove it after expiry, and let verifiers cache/refresh by HTTP cache headers. If the future profile chains to DNS `k`, that DNS chain is a defining property of an AID-anchored key directory. If it does not chain to DNS `k`, it is a normal external WBA/JWKS-style directory outside AID core. AID v2 core does not pre-commit either path.

## Why No Rotation In V2 Core

AID v2 deliberately does not add a DNS-level rotation mechanism.

- v1 `kid` was only a label. It detected neither legitimate rotation nor key compromise.
- `prev` chains help only clients that already pinned the old key and require structured history to handle missed rotations.
- Multi-key RRsets change the result model from one selected record to one endpoint descriptor with an active key set.
- DNS propagation can show old-only, new-only, or both; making overlap normative would require substantial client policy surface.
- Lost-key and compromised-key events are not solved by DNS `prev` or key-set overlap.
- Common ecosystems solve rotation outside minimal discovery records: JWKS/WBA directories, SPIFFE bundles, DKIM selectors, TLS certificate replacement.
- Therefore AID v2 core states the current DNS key honestly and leaves graceful managed rotation to future profiles or local verifier policy.

## DNS Multi-Key RRset Decision

`v2-change-plan-v2.md` left optional multi-key overlap open. This plan recommends not putting it in v2 core, but reviewers should see the decision explicitly rather than infer it from the executive summary.

Rejected-for-core shape:

```dns
_agent.acme.com. 300 IN TXT "v=aid2;p=mcp;u=https://agent.acme.com/mcp;k=<old-key>"
_agent.acme.com. 300 IN TXT "v=aid2;p=mcp;u=https://agent.acme.com/mcp;k=<new-key>"
```

Why not core:

- It erodes the current deterministic ambiguity rule.
- It requires exact rules for normalized non-key field equivalence across aliases, field order, unknown keys, metadata, and deprecation fields.
- It changes discovery from one selected `AidRecord` to an endpoint descriptor plus key set.
- It changes PKA verification because response `keyid` selects one key from the active set.
- It changes cache and downgrade state from one previous key to key-set add/remove/replacement events.
- It does not solve lost-key rotation, compromised-key rotation, or first-contact trust.

If reviewers decide AID v2 should redesign the key model anyway, specify `AidKeySet` as a first-class result before any SDK work:

```ts
type AidV2Result = {
  v: 'aid2';
  uri: string;
  proto: string;
  auth?: string;
  desc?: string;
  docs?: string;
  dep?: string;
  keys: Array<{ k: string; keyid: string }>;
};
```

That is a coherent larger v2, but it is not the minimal endpoint-and-key anchor.

## Spec Sections To Edit

Primary file: `packages/docs/specification.md`.

1. Header and status
   - Change title/version from `v1.2.0` to v2 draft language.
   - Make status explicit: draft until reviewed.
   - Keep v1.2 history available through versioning docs, not mixed into v2 normative text.
   - Add the positioning sentence: AID is the first-contact endpoint-and-key anchor; rotation, attestation, request provenance, and organizational identity compose on top.

2. Section 2.1 Format and key table
   - `version` row: for v2, `v` MUST be `aid2`.
   - `pka`/`k` row: change from multibase to unpadded base64url Ed25519 JWK `x`.
   - Remove `kid`/`i` row from the v2 table.
   - Add text: v2 providers MUST NOT publish `kid`/`i` for AID key identity. Clients MUST NOT use `kid`/`i` for v2 PKA verification.
   - Decide before implementation whether a v2 record containing `i` is invalid or ignored as unknown. Recommendation: invalid if `i` or `kid` is recognized, because otherwise stale v1 examples appear to work while verification uses different identity semantics.

3. Section 2.2 Examples
   - Update all examples to `v=aid2`.
   - Replace PKA example with `k=<43-char-base64url-x>` and no `i`.
   - Include one explicit migration example showing the same Ed25519 key as `aid1` multibase and `aid2` JWK `x`.

4. Section 2.3 Client Discovery Algorithm
   - Partition records by supported version before ambiguity checks.
   - For clients supporting both versions, select the highest supported valid major version by policy, normally `aid2` before `aid1`.
   - Apply the “multiple valid records = ambiguity” rule within the selected version.
   - If no valid `aid2` record exists, fallback to `aid1` MAY occur by policy.
   - Returning clients that previously selected `aid2` SHOULD treat `aid1`-only results as a version downgrade.
   - Endpoint proof step must derive expected `keyid` from `k`; no DNS `kid`.

5. Section 3 Security Rules
   - Rewrite Endpoint Proof:
     - When `k`/`pka` is present, clients MUST verify endpoint proof using RFC 9421 HTTP Message Signatures with Ed25519.
     - The expected key identity is the RFC 7638 JWK SHA-256 thumbprint derived from `k`.
     - The `alg` parameter is compared case-insensitively and MUST have the semantic value `ed25519`.
   - Replace “Providers MUST publish `kid`/`i`” with “Providers MUST NOT rely on DNS `kid`/`i` for AID v2 PKA.”
   - Define the trust claim narrowly: AID v2 proves the domain currently publishes this endpoint/key and the endpoint controls the matching private key. It does not prove authorization, workload identity, delegation, reputation, or user authority.

6. Section 3.1 Threat Model
   - Replace “detect removal or rotation” with “detect PKA removal, key replacement, and version downgrade when previous security state is available.”
   - Keep compromised authoritative DNS out of scope.
   - Add a warning that key replacement is not cryptographic continuity. It is DNS-current key state plus local policy.

7. Section 3.2 Enterprise Policy Modes
   - Keep policy modes, but update them for v2 state:
     - `pka=require`: fail if selected record has no `k`.
     - `downgrade=warn|fail`: applies to PKA removal, key replacement, and `aid2` to `aid1` downgrade.
     - `.well-known` cannot satisfy `dnssec=require`.
   - Consider moving detailed presets to `packages/docs/Reference/enterprise_rollout.md` and keeping only minimal policy semantics in the spec. This is a reviewer question because enterprise presets are more operations profile than core protocol.

8. Section 5 Future Path
   - Remove any implication that v2 must move to SRV/SVCB.
   - Keep `_agent` label stable in this draft unless the IANA/WG label decision changes separately.
   - Acknowledge that the RFC 8552 `_agent` registration was rejected on 2026-04-27. The label decision is decoupled from the PKA cleanup and remains pending WG/BoF direction.
   - Mention WBA/JWKS-style key directories as future profile work, not v2 core.
   - State that v2 core records hold a single key; multi-key overlap is deferred to a future key-directory profile or first-class `AidKeySet` redesign.

9. Appendix D PKA Handshake
   - Replace `performPKAHandshake(uri, pka, kid)` with `performPKAHandshake(uri, pka)`.
   - Define strict `k` decoding:
     - `k` MUST be unpadded base64url.
     - Decoding MUST yield exactly 32 octets.
     - Legacy `z...` multibase MUST NOT be accepted in `v=aid2`.
   - Define JWK thumbprint:
     - Construct UTF-8 JSON exactly as `{"crv":"Ed25519","kty":"OKP","x":"<k>"}`.
     - Compute SHA-256 over those bytes.
     - Encode digest as unpadded base64url.
     - This value is the expected HTTP Message Signature `keyid`.
   - Define RFC 9421 response signature requirements. Recommended v2 shape:

```http
Accept-Signature: aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created;expires;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
Signature-Input: aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created=<unix>;expires=<unix>;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
Signature: aid-pka=:<base64-signature>:
```

- This replaces the first spike's `date` + `AID-Challenge` shape. The first spike is superseded by `tracking/spikes/2026-05-23-rfc9421-pka-no-date-respike-results.md`.
- Rationale for removing signed HTTP `Date`: `created` and `expires` are the RFC 9421 signature lifecycle controls; WBA-style examples rely on those parameters plus `nonce`; signing `Date` adds proxy/CDN/framework fragility without adding meaningful challenge freshness.
- The client challenge is carried in RFC 9421 `nonce`, not as a covered AID-specific request header.
- The nonce MUST have at least 32 bytes of entropy and SHOULD be encoded as unpadded base64url for transport.
- Verifiers compare the received `nonce` value exactly to the challenge value they sent.
- Servers do not need to persist nonce state in v2 core because the verifier supplies the one-shot nonce and rejects responses that do not echo it in signed `@signature-params`.
- Preferred challenge transport is RFC 9421 `Accept-Signature` with the required `nonce`. The exact Structured Fields syntax must be validated while drafting Appendix D and the canonical vector.
- Clients SHOULD send `Cache-Control: no-store` on PKA requests.
- PKA responses MUST include `Cache-Control: no-store` unless the spec deliberately defines an exact cache-varying alternative. Do not leave this as implementation policy; nonce-bound endpoint proofs are per-request artifacts.
- Missing response `Cache-Control: no-store` is a protocol error. Strict verifiers SHOULD fail; compatibility modes MAY warn only during migration.
- The signature MUST bind the request target and response status.
- `@method`, `@target-uri`, and `@authority` are request-derived components and MUST use `;req` in the response signature.
- `@status` is response-derived and MUST NOT use `;req`.
- `@status` signs the returned status; v2 PKA MUST NOT require the signed response to be `200`. Signed `401` is useful for OAuth/auth.md handoff flows.
- Using RFC 9421 `nonce`, `;req` for request-derived components, and `@status` is an intentional v2 wire-format break from the current SDK signature-base construction in `packages/aid/src/pka.ts`.
- The verifier MUST rebuild the signature base using the request/response context, compare unquoted `keyid` to the derived thumbprint, enforce freshness, and verify Ed25519 with the decoded `k`.
- Keep raw `keyid` syntax when rebuilding `@signature-params`; compare normalized unquoted value for equality.
- `expires` is mandatory in v2 to remove ambiguity around freshness windows. `expires - created` MUST be at most 300 seconds and SHOULD be at most 60 seconds.
- Verifiers MAY allow a small clock-skew tolerance when evaluating `created` and `expires`; use roughly 30 seconds unless implementation experience suggests a different value.
- Signers MUST emit `alg="ed25519"` lowercase. Verifiers MAY preserve current SDK compatibility by comparing the semantic value case-insensitively, but MUST reconstruct `@signature-params` from the received Structured Field value, not from a lowercased replacement.
- Redirects during PKA are forbidden. Clients verify the discovered `u` endpoint, not a redirected final URI.
- `@target-uri` is the actual PKA request URI derived from the discovered `u`, with fragments removed and query preserved.
- `@authority` is the externally visible authority for that request: lowercase hostname, omit default port, retain non-default port.
- Reverse-proxy deployments must configure PKA signing against the externally visible scheme, authority, and URI values.

10. Appendix D.1 Key Format Interoperability

- Simplify: no conversion from multibase is needed in v2 because `k` is already JWK `x`.
- Keep v1 conversion as migration guidance, not v2 key format.

11. Appendix E `.well-known` Fallback

- State that DNS-discovered records have `trustSource=dns`.
- State that fallback-discovered records have `trustSource=well-known-tls`.
- PKA over fallback proves consistency with TLS-hosted metadata, not DNS-published external trust.
- `.well-known` JSON for v2 mirrors v2 keys and must not require `i`.

12. Appendix F Composition Notes

- Add a non-normative auth.md handoff note: AID resolves and optionally verifies the endpoint, then OAuth/auth.md layers perform registration and credential issuance.
- Name the standards boundary without importing auth.md into core: RFC 9728 Protected Resource Metadata, RFC 8414 Authorization Server Metadata, and `agent_auth` when present.
- Do not specify ID-JAG `aud`, provider trust-list format, scopes, revocation, credential types, SPIFFE bundles, WIMSE trust domains, or auth.md registration payloads in AID core.
- Clarify that AID PKA does not verify auth.md, issue credentials, or prove user/workload authorization.

13. References

- Keep RFC 7638, RFC 8037, RFC 9421.
- Add any RFC 9421 response-signature details needed for `;req`, `@authority`, and `@status` references.
- Add RFC 9728 and RFC 8414 only if Appendix F includes the auth.md handoff note.

## Proposed Normative Language

Use this language as the starting point for spec edits.

### PKA Key Format

For AID v2, the `pka` (`k`) value, when present, **MUST** be the unpadded base64url encoding of the raw 32-octet Ed25519 public key. The value is exactly the `x` member of the RFC 8037 OKP JWK:

```json
{ "kty": "OKP", "crv": "Ed25519", "x": "<k>" }
```

Clients **MUST** reject an AID v2 `k` value that is padded, contains characters outside the base64url alphabet, or does not decode to exactly 32 octets.

### Derived Key Identity

For AID v2 PKA, clients and servers **MUST** compute the expected HTTP Message Signature `keyid` as the RFC 7638 JWK Thumbprint using SHA-256 over this exact UTF-8 JSON serialization:

```json
{ "crv": "Ed25519", "kty": "OKP", "x": "<k>" }
```

The resulting SHA-256 digest **MUST** be encoded as unpadded base64url. Implementations **MUST NOT** hash the raw public key bytes directly for `keyid`.

### DNS `kid` Removal

AID v2 records **MUST NOT** use DNS `kid` (`i`) for endpoint proof. The key identity is derived from `k`. AID v2 clients **MUST NOT** compare HTTP Message Signature `keyid` to a DNS `kid` value.

Compatibility decision: a v2 record containing `kid`/`i` is invalid when recognized, because the field has a known legacy meaning that is unsafe to silently carry into v2.

### Signature Algorithm

For AID v2 PKA, the HTTP Message Signature `alg` parameter **MUST** have the semantic value `ed25519`. Clients **MUST** compare the value case-insensitively, preserving current SDK behavior and avoiding a migration-only failure for existing implementations that emit case variants such as `Ed25519`.

Signers **MUST** emit `alg="ed25519"` lowercase. Case-insensitive verifier acceptance is an AID compatibility allowance, not a claim that case variants are preferred WBA/RFC syntax. Verifiers **MUST** reconstruct `@signature-params` from the received Structured Field value.

### PKA Response Signature

AID v2 PKA uses a nonce-bound RFC 9421 response signature. The current preferred shape, pending exact Structured Fields validation during canonical vector work, is:

```http
Accept-Signature: aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created;expires;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
Signature-Input: aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created=<unix>;expires=<unix>;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
Signature: aid-pka=:<base64-signature>:
Cache-Control: no-store
```

The signature **MUST NOT** cover HTTP `Date` in v2 core. Freshness is provided by the client-generated challenge in `nonce`, mandatory `created`, mandatory `expires`, verifier equality-check against the nonce it sent, and a short validity window.

The client-generated challenge **MUST** contain at least 32 bytes of entropy and **SHOULD** be transported as unpadded base64url. The verifier **MUST** compare the received `nonce` exactly to the challenge it sent. Servers are not required to store nonce state in v2 core because the verifier supplies the one-shot nonce and the signed response is not cacheable.

PKA responses **MUST** include `Cache-Control: no-store`. Clients **SHOULD** send `Cache-Control: no-store` on PKA requests. A missing response `no-store` directive is a protocol error; strict verifiers should reject it.

`expires` **MUST** be greater than `created` and `expires - created` **MUST NOT** exceed 300 seconds. Signers **SHOULD** use 60 seconds or less. Verifiers **MAY** allow a small clock-skew tolerance when evaluating `created` and `expires`.

Clients **MUST NOT** follow redirects during PKA verification. The request context is the discovered endpoint URI after fragment removal. Query strings are preserved. `@authority` uses the externally visible request authority with a lowercased hostname, default port omitted, and non-default port retained. Servers behind reverse proxies must sign the externally visible request context.

Verifiers **MUST** select the AID PKA signature by validating required covered components, `tag="aid-pka-v2"`, `keyid`, `alg`, nonce equality, freshness, and Ed25519 verification. Verifiers **MUST NOT** rely on the signature label alone as the protocol discriminator.

### Record Ambiguity

For AID v2 core, if more than one valid AID v2 record is present at the selected DNS name, clients **MUST** fail with `ERR_INVALID_TXT` due to ambiguity. Clients **MUST NOT** choose among multiple valid records by DNS answer order.

During `aid1` to `aid2` migration, clients that support both versions should first partition valid records by version, select the highest supported version allowed by local policy, then apply ambiguity checks within that version.

## Migration From `aid1` To `aid2`

Provider migration:

1. Inventory current `aid1` records and identify any PKA records using `k=z...;i=<kid>`.
2. Decode the v1 multibase/base58btc `k` to the 32-byte Ed25519 public key.
3. Encode those bytes as unpadded base64url. This is the v2 `k` and the JWK `x`.
4. Publish `v=aid2;u=<same endpoint>;p=<same proto>;k=<base64url-x>` without `i`.
5. Keep `aid1` published during a compatibility window if old clients need it.
6. Use the same raw Ed25519 key for the first `aid2` publication where possible, so format migration is not also key rotation.
7. Remove `aid1` after the compatibility window.

Client migration:

1. Add parser support for both `aid1` and `aid2`.
2. Select `aid2` before `aid1` when both are present and valid, unless policy says otherwise.
3. Treat `aid2` to `aid1` fallback as a downgrade for returning clients that previously observed `aid2`.
4. Keep v1 PKA code only for `aid1` records. Do not accept v1 multibase PKA in `aid2`.
5. Clients that maintain previous security state MUST derive and store the JWK thumbprint of `pka` for both `aid1` and `aid2` records. This makes stored security state forward-compatible: a v1→v2 migration that reuses the same raw Ed25519 key does not falsely register as a key-replacement event.
6. Store previous security state with enough context for v2 downgrade handling:

```ts
{
  domain: string;
  queriedName: string;
  proto: string;
  version: 'aid1' | 'aid2';
  uri: string;
  keyThumbprints: string[];
  trustSource: 'dns' | 'well-known-tls';
  dnssecValidated: boolean | null;
  observedAt: string;
}
```

This is the logical in-memory security state. It is not the current aid-doctor on-disk cache shape.

Current on-disk cache:

```ts
{
  lastSeen: string;
  pka: string | null;
  kid: string | null;
  hash?: string | null;
}
```

Implementation must add a cache schema version and a read-old/write-new migration path before changing downgrade logic. Do not silently drop existing `~/.aid/cache.json` entries.

Downgrade/key-change categories to define in implementation:

- PKA added.
- PKA removed.
- PKA key replaced.
- Version downgraded from `aid2` to `aid1`.
- DNS failed and fallback supplied TLS-hosted metadata.
- Key-directory/profile events, such as key added to a directory or key expired from a directory, are out of core.

## Test Vectors And Conformance Impact

Primary fixtures:

- `protocol/pka_vectors.json`
- `test-fixtures/golden.json`
- `test-fixtures/enterprise.json`
- `packages/aid-conformance/src/index.ts`

Required vector changes:

1. Add canonical v2 key vector:
   - `k` as unpadded base64url JWK `x`.
   - expected JWK thumbprint.
   - expected decoded public key bytes length: 32.
2. Replace `kid-mismatch` with `keyid-thumbprint-mismatch`.
3. Add invalid `k` vectors:
   - padded base64url.
   - invalid base64url character.
   - decodes to 31 bytes.
   - decodes to 33 bytes.
   - legacy `z...` multibase inside `v=aid2`.
4. Add `alg` normalization vector:
   - `alg="ed25519"` passes.
   - `alg="Ed25519"` also passes because AID v2 preserves case-insensitive `alg` comparison.
   - non-Ed25519 values fail.
5. Add stale `i`/`kid` vector:
   - recommended expected result: `ERR_INVALID_TXT`.
6. Add migration/discovery vectors:
   - one valid `aid1` plus one valid `aid2` at the same name selects `aid2`.
   - two valid `aid2` records remains ambiguity.
   - one valid `aid2` plus malformed `aid2` still succeeds if exactly one valid selected-version record exists.
   - no valid `aid2`, one valid `aid1` may fallback by policy.

Vector retention strategy: keep existing v1 vectors and add new v2 vectors. Use a flat discriminated array, with each entry carrying `"v": "aid1" | "aid2"` as a discriminant. This matches the resolved discriminated-union API direction (`AidRecord = AidRecordV1 | AidRecordV2`), so on-disk fixtures and in-code types share one shape with no translation.

Conformance package changes:

- Change `AidRecord.v` type from `'aid1'` only to version-aware records or separate `AidRecordV1` and `AidRecordV2`.
- Remove `kid` from v2 expected shape.
- Keep v1 fixtures if conformance continues to test both versions.
- Add v2-only fixtures for parser parity and PKA thumbprint parity.

Docs verification:

- Any change under `packages/docs/**` requires `pnpm docs:verify`.
- If docs export manifests change, commit `packages/docs/export-manifest.json` and `packages/docs/export-manifest.sha256`.

## SDK And Package Impact

### Single Source And Codegen

Files:

- `protocol/constants.yml`
- `protocol/spec.ts`
- `packages/web/src/generated/spec.ts`
- `scripts/generate-constants.ts`
- `scripts/generate-examples.ts`

Plan:

- Update `protocol/constants.yml` for `schemaVersion: 2.0.0`, `specVersion: aid2`, new `pka` description, and remove `kid`/`i` from v2.
- Run `pnpm gen`.
- Confirm generated outputs remove `kid` from v2 types.
- If dual-version generated types are needed, update generator before changing downstream packages.

Risk:

- The current generator emits one current spec shape. A clean dual-version implementation may require explicit `AidRecordV1` and `AidRecordV2` types rather than mutating the only `AidRecord` type.

### TypeScript SDK `packages/aid`

Files:

- `packages/aid/src/constants.ts`
- `packages/aid/src/parser.ts`
- `packages/aid/src/pka.ts`
- `packages/aid/src/client.ts`
- `packages/aid/src/browser.ts`
- `packages/aid/src/discovery-security.ts`
- `packages/aid/src/*.test.ts`

Plan:

- Introduce version-aware parser validation.
- Remove v2 `kid` requirement.
- Parser validation is version-dependent: in `aid1`, `pka` REQUIRES `kid` (current behavior at `packages/aid/src/parser.ts:275-277`); in `aid2`, `pka` does not require `kid`, and recognized `kid`/`i` presence is invalid.
- Implement one shared helper for base64url decode and RFC 7638 thumbprint derivation.
- Change `performPKAHandshake(uri, pka, kid)` to `performPKAHandshake(uri, pka)` for v2.
- Keep v1 handshake path if supporting `aid1` in the same package.
- Update Node and browser discovery selection logic.
- Update downgrade state from `{pka,kid}` to version/trust/key thumbprint state.

Complexity:

- Browser and Node implementations duplicate discovery logic.
- Current parser ignores unknown keys, so stale `i` behavior needs explicit tests.
- Current `alg` comparison lowercases before compare; preserve this behavior for v2 while still rejecting non-Ed25519 values.

### Go `packages/aid-go`

Files:

- `record.go`
- `parser.go`
- `discover.go`
- `fallback.go`
- `pka.go`
- `*_test.go`

Plan:

- Remove or version-gate `Kid`.
- Use stdlib `base64.RawURLEncoding`, `crypto/sha256`, and `crypto/ed25519`.
- Replace `multibaseDecode` and base58 helpers for v2.
- Update vector tests to derive keyid from `k`.

### Python `packages/aid-py`

Files:

- `aid_py/parser.py`
- `aid_py/discover.py`
- `aid_py/pka.py`
- `tests/test_*.py`

Plan:

- Remove or version-gate `kid`.
- Use stdlib `hashlib.sha256` and strict base64url decode with padding rejection.
- Keep Ed25519 verification through existing `cryptography`/PyNaCl path.
- Check DNS discovery and well-known fallback parity; current behavior may differ.

### Rust `packages/aid-rs`

Files:

- `src/record.rs`
- `src/parser.rs`
- `src/discover.rs`
- `src/well_known.rs`
- `src/pka.rs`
- `Cargo.toml`
- `tests/*`

Plan:

- Remove or version-gate `kid`.
- Use `base64` URL-safe no-pad decode.
- Add `sha2` or equivalent under the `handshake` feature for RFC 7638 thumbprints.
- Consider removing `bs58` from v2-only builds, but keep if v1 compatibility remains.

### .NET `packages/aid-dotnet`

Files:

- `src/Record.cs`
- `src/Parser.cs`
- `src/Discovery.cs`
- `src/WellKnown.cs`
- `src/Handshake.cs`
- `tests/*`

Plan:

- Remove or version-gate `Kid`.
- Add local base64url helpers.
- Use `SHA256.HashData` and `CryptographicOperations.FixedTimeEquals`.
- Keep `NSec.Cryptography` Ed25519 verification.
- Fix challenge encoding if v2 requires unpadded base64url challenge values.

### Java `packages/aid-java`

Files:

- `src/main/java/org/agentcommunity/aid/AidRecord.java`
- `Parser.java`
- `Discovery.java`
- `WellKnown.java`
- `Handshake.java`
- tests and vector resources

Plan:

- Remove or version-gate `kid`.
- Use `Base64.getUrlDecoder()`, `Base64.getUrlEncoder().withoutPadding()`, and `MessageDigest`.
- Replace `multibaseDecode`.
- Replace or supplement `HandshakeTest`; current test harness is not a full AID HTTP Message Signature vector test.

### aid-engine And aid-doctor

Files:

- `packages/aid-engine/src/keys.ts`
- `packages/aid-engine/src/generator.ts`
- `packages/aid-engine/src/checker.ts`
- `packages/aid-engine/src/types.ts`
- `packages/aid-doctor/src/cli.ts`
- `packages/aid-doctor/src/output.ts`
- `packages/aid-doctor/src/cache.ts`
- `packages/aid-doctor/README.md`

Plan:

- Key generation should output base64url JWK `x`, not `z` base58.
- Validation should decode exactly 32 bytes and show derived thumbprint.
- Reports should show `keyid`/thumbprint, not DNS `kid`.
- Cache should store previous key thumbprints and trust source after an explicit schema migration from the current `{pka,kid}` shape.
- Add cache schema versioning and read-old/write-new behavior for `~/.aid/cache.json`.
- CLI `pka verify --key` help text must change from `z-prefixed multibase` to base64url JWK `x`.

### Web Workbench `packages/web`

Files:

- `src/lib/generator/core.ts`
- `src/lib/api/generator-validation.ts`
- `src/lib/aid-generator.ts`
- `src/components/workbench/v11-fields/security-fields.tsx`
- `src/components/ui/pka-key-generator.tsx`
- `src/hooks/use-pka-verification.ts`
- `src/hooks/use-discovery.ts`
- `src/hooks/use-connection.ts`
- `src/app/api/pka-demo/route.ts`
- generated examples/spec files

Plan:

- Remove visible Key ID field for v2.
- Add derived thumbprint display/copy if useful.
- Update local PKA validation from z-base58 to base64url 32-byte decode.
- Update demo endpoint to derive HMS `keyid` from the published key.
- Support both v1 and v2 modes during migration where the workbench still needs to generate or validate legacy examples; default new examples to v2.

### Docs

Core docs with old semantics:

- `packages/docs/specification_v2_explained.md`
- `packages/docs/Reference/identity_pka.md`
- `packages/docs/Reference/security.md`
- `packages/docs/Reference/enterprise_rollout.md`
- `packages/docs/Reference/discovery_api.md`
- `packages/docs/Reference/troubleshooting.md`
- `packages/docs/Reference/versioning.md`
- `packages/docs/Reference/well_known_json.md`
- `packages/docs/Tooling/aid_doctor.md`
- `packages/docs/Tooling/aid_engine.md`
- `packages/docs/quickstart/index.md`
- language quickstarts
- `README.md`
- `AGENTS.md`
- `EXAMPLES.md`

Plan:

- Keep `packages/docs/specification_v2_explained.md` as the shareable v2 preview until the actual v2 spec PR is ready. This page includes semantic v1.2-to-v2 comparison, explainer callouts, draft normative text, composition notes, migration notes, remaining checks, and reviewer questions.
- Keep `packages/docs/specification.md` untouched while the preview is circulating, so reviewers can compare v1.2 and the proposed v2 shape side by side.
- Keep `packages/docs/meta.json` listing `specification_v2_explained` only while a branch preview is useful; decide separately whether it belongs in main docs navigation before merging to production.
- Run `pnpm docs:check`, `pnpm docs:export`, Prettier, and `git diff --check` after editing the preview. `pnpm docs:verify` will fail before commit when a new docs page changes `packages/docs/export-manifest.json` and `packages/docs/export-manifest.sha256`; that manifest diff is expected and should be committed with the page.
- Update v2 normative docs in the same PR as spec draft.
- Keep v1 compatibility notes clear and separate.
- Do not overclaim PKA as authorization or workload identity.

## Resolved Decisions

These decisions are treated as settled unless a reviewer presents a concrete interoperability or security blocker:

1. Keep DNS multi-key RRsets out of v2 core. A future key-set model must be designed as a first-class result, not smuggled into the v2 key-format cleanup.
2. A v2 record containing recognized `kid`/`i` is invalid.
3. `expires` is mandatory in v2 PKA responses.
4. `alg` comparison remains case-insensitive, with required semantic value `ed25519`.
5. Keep minimal enterprise policy semantics in the core spec, but move presets/runbooks to Reference docs where possible.
6. Keep `.well-known` fallback, but label its trust source as `well-known-tls`; it does not satisfy DNSSEC-backed trust.
7. Use versioned record types internally and expose a discriminated union (`AidRecordV1 | AidRecordV2`) where a combined API is useful.
8. Add aid-doctor cache schema migration and backfill JWK thumbprints for existing v1 PKA entries.
9. Treat future key-directory support as a separate non-core document/profile.
10. Keep `_agent` in the v2 draft; label changes are independent of PKA cleanup and pending WG/BoF direction.
11. Keep `k` as the DNS field name. The value of `k` is the RFC 8037 JWK `x`; do not rename the DNS field to `x`.
12. Remove signed HTTP `Date` from the v2 PKA response signature.
13. Prefer RFC 9421 `nonce` for the PKA client challenge.
14. Prefer RFC 9421 `Accept-Signature` as the PKA response-signature challenge transport.
15. Require `Cache-Control: no-store` on nonce-bound PKA responses.
16. Do not add auth.md / `agent_auth` fields to AID v2 core; support auth.md through a non-normative OAuth handoff note.
17. Treat same-key use with WBA as allowed by operator policy but not recommended by AID core.
18. Require PKA nonce challenges to have at least 32 bytes of entropy and recommend unpadded base64url transport.
19. Do not require server-side nonce storage in v2 core; one-shot verifier-generated nonce, exact echo comparison, short expiry, and `no-store` are sufficient for this endpoint-proof profile.
20. Set PKA validity window to `expires - created <= 300s`, with `<= 60s` recommended.
21. Allow small verifier clock skew, approximately 30 seconds, when evaluating `created` and `expires`.
22. Reject redirects during PKA and verify only the discovered endpoint URI.
23. Define `@target-uri` from the actual PKA request to discovered `u`, with fragments removed and query preserved.
24. Define `@authority` from the externally visible request authority: lowercase hostname, omit default port, retain non-default port.
25. Bind whatever response status is returned; do not require PKA response status `200`, so signed `401` can support OAuth/auth.md handoff.

## Remaining Checks Before Spec PR / SDK Work

1. Exact RFC 9421 `Accept-Signature` syntax
   - Direction is settled: use RFC 9421 `nonce` and prefer `Accept-Signature` for challenge transport.
   - Before Appendix D text is frozen, verify the exact Structured Fields syntax for requesting a response signature with `nonce`, `created`, `expires`, `keyid`, `alg`, and `tag`.

2. Independent RFC 9421 vector check
   - The disposable spikes proved the intended bytes, not full Structured Fields/parser interoperability.
   - Before SDK implementation, create one canonical v2 PKA vector and verify it with at least one independent RFC 9421 / Structured Fields implementation.
   - This is a pre-SDK/conformance gate, not a blocker for drafting initial Appendix D text.

3. auth.md Appendix F wording
   - Add non-normative handoff text without specifying ID-JAG `aud`, provider trust lists, registration payloads, or auth.md metadata registry status.
   - Avoid claiming AID verifies auth.md; AID verifies the endpoint/key, then the OAuth/auth.md layer handles credentials.

## Risks

- Overclaiming risk: PKA proves domain-published endpoint/key control, not authorization, delegation, internal workload identity, reputation, or human authority.
- RFC 9421 correctness risk: v1 implementation and prose are too loose. v2 must specify the signature base precisely.
- Reviewer-easy-error risk: invalid `;req` placement or ambiguous derived-component targets will undermine review even if the broader design is right.
- Challenge-transport risk: if `Accept-Signature` syntax or semantics are left vague, independent SDKs will implement incompatible PKA request flows.
- Cache-replay risk: nonce-bound PKA responses must not be replayed by intermediaries; require `Cache-Control: no-store`.
- Proxy/canonicalization risk: reverse proxies and redirects can cause `@target-uri` / `@authority` mismatches unless the spec defines the externally visible request context precisely.
- Strictness rollout risk: rejecting redirects and missing response `no-store` is cleaner security posture but may require migration notes for existing endpoints and demos.
- Rotation-scope risk: adding DNS rotation semantics would change the whole discovery result model. Keeping rotation out of core is the cleanest way to ship v2.
- Version migration risk: publishing `aid1` and `aid2` side by side only works if clients partition records by version before ambiguity checks.
- Silent legacy-field risk: if `i` becomes unknown and ignored, operators may think v1 rotation labels still matter.
- Cross-language drift risk: every SDK must derive thumbprints exactly the same way. Central vectors are mandatory.
- Trust-source confusion: `.well-known` fallback must not be described as DNS-rooted trust.
- auth.md overreach risk: AID can hand off to OAuth/auth.md, but must not become an authorization server, credential issuer, provider trust-list format, or ID-JAG profile.
- Pkarr overclaim risk: AID uses compact Ed25519 key material, but does not adopt Pkarr key-addressed identity or signed DNS packet semantics.
- Tooling drift risk: aid-doctor, aid-engine, web generator, live PKA demo, examples, and docs all currently teach `z...;i=g1`.

## Reviewer Questions

Ask reviewers these concrete questions:

1. Is the proposed no-date RFC 9421 `aid-pka` response signature shape correct and implementable?
2. Is the exact RFC 9421 `Accept-Signature` serialization valid and implementable with existing Structured Fields libraries?
3. Are the covered components sufficient to bind the request target, response status, and nonce challenge without overfitting to one SDK?
4. Are the nonce, expiry, clock-skew, redirect, cache, and authority rules strict enough for security while still practical for real deployments?
5. Is signed non-`200` response support, especially signed `401`, the right way to allow OAuth/auth.md handoff without weakening endpoint proof?
6. Is side-by-side `aid1`/`aid2` publication with version partitioning acceptable for migration?
7. Is the `_agent` label note sufficient for IETF circulation while the label decision remains decoupled from PKA cleanup?
8. Is the future WBA/JWKS-style key-directory boundary clear enough, or should the v2 spec include a short non-normative appendix?
9. Does the non-normative WIMSE/SPIFFE/OAuth/auth.md composition guardrail avoid overclaiming while preserving future profile work?
10. Is the Pkarr boundary clear enough: compact Ed25519 key material, but not Pkarr's key-addressed identity model?

## Suggested Work Sequence After Review

Do not start this sequence until the open decisions above are resolved.

1. Spec draft PR
   - Edit `packages/docs/specification.md`.
   - Edit `packages/docs/Reference/versioning.md`.
   - Run `pnpm docs:verify`.

2. Constants and fixtures PR
   - Edit `protocol/constants.yml`.
   - Edit `protocol/pka_vectors.json`, `test-fixtures/golden.json`, and `test-fixtures/enterprise.json`.
   - Run `pnpm gen`.
   - Run conformance tests.

Preview branch before the spec PR:

- Commit the review artifact paths explicitly:
  - `packages/docs/specification_v2_explained.md`
  - `packages/docs/meta.json`
  - `packages/docs/export-manifest.json`
  - `packages/docs/export-manifest.sha256`
  - `tracking/plans/2026-05-07-aid-v2-spec-plan.md`
  - `tracking/plans/2026-05-23-rfc9421-pka-spike-and-spec-draft-plan.md`
  - `tracking/spikes/2026-05-23-rfc9421-pka-no-date-respike-results.md`
  - `tracking/spikes/2026-05-23-rfc9421-pka-spike-results.md`
- Push branch `update/aid-v2-spec-plan` to GitHub for a temporary preview.
- If Cloudflare Workers branch previews are enabled, use the generated branch preview URL. If they are not enabled, use the GitHub branch as the shareable artifact and deploy manually only after confirming the Worker deployment target will not overwrite production.

3. TypeScript core PR
   - Implement version-aware parser and v2 PKA helper.
   - Update Node/browser discovery and security state.
   - Run `pnpm -C packages/aid test`.

4. Tooling and web PR
   - Update aid-engine, aid-doctor, workbench generator, PKA key UI, and demo endpoint.
   - Run package tests and web tests.

5. Non-TS SDK parity PRs
   - Implement Go, Python, Rust, .NET, and Java with shared vectors.
   - Run each language test suite.

6. Documentation sweep PR
   - Update quickstarts, Reference pages, Tooling docs, README, EXAMPLES, and AGENTS.
   - Run `pnpm docs:verify`.

7. Full release verification
   - `pnpm build`
   - `pnpm test`
   - `pnpm test:parity`
   - `pnpm e2e`
   - Per-SDK commands from `AGENTS.md`
