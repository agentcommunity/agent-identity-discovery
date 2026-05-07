# AID v2 Spec Plan

> **For agentic workers:** This is a research-phase spec and implementation plan. Do not implement SDK changes from this file until the v2 spec text and open decisions are reviewed. When implementation starts, use `superpowers:subagent-driven-development` or `superpowers:executing-plans` task by task.

**Goal:** Produce a circulatable AID v2 spec draft that defines AID as the first-contact endpoint-and-key anchor while cleaning up PKA key encoding, key identity, and migration from `aid1`.

**Current recommendation:** Ship v2 core as one valid `aid2` TXT record per queried DNS name, `k`/`pka` as unpadded base64url Ed25519 JWK `x`, no DNS `kid`/`i`, no `prev`, no multi-key RRset, and HTTP Message Signature `keyid` derived from `k` as the RFC 7638 JWK SHA-256 thumbprint.

**Inputs preserved:** The historical `v2-change-plan.md` remains historical context. The current design input is `/Users/team/dev/PROJECTS/AgentCommunity/RESEARCH/AID_UPGRADE/v2-change-plan-v2.md`.

**Positioning sentence for spec reviewers:** AID is the first-contact endpoint-and-key anchor: DNS publishes the current endpoint and the current Ed25519 public key; everything else, including rotation, attestation, request provenance, and organizational identity, composes on top.

---

## Executive Recommendation

Keep v2 focused on key identity cleanup, not rotation infrastructure:

- Do `k`/`pka` base64url cleanup now.
- Do derived RFC 7638 `keyid` now.
- Remove DNS `kid`/`i` now.
- Decide whether `alg="ed25519"` should become mandatory and case-sensitive for AID v2 PKA.
- Tighten Appendix D so it defines an actual RFC 9421 signature base, not just a conceptual Ed25519 check.
- Keep one valid `aid2` DNS record in v2 core.
- Recommend against adding `prev`, selectors, validity windows, or any DNS-level key-rotation mechanism to v2 core.
- Current recommendation excludes multi-key RRsets from v2 core; this is reviewed under Open Decision #1 with the `AidKeySet` alternative.
- If AID later needs managed rotation, define it in an HTTP key-directory/profile layer using JWKS/WBA-style overlap.

Reason: key rotation is an operational key-management problem. WBA, OAuth/OIDC JWKS, DKIM selectors, webhook signing, and TLS all handle rotation through key directories, selectors, validity windows, or certificate replacement outside the minimal discovery record. AID v2 core should honestly state: DNS currently publishes this endpoint and this key. If that key changes, returning clients apply local pinning/downgrade policy. AID core should stop pretending v1 `kid` solved rotation, clean up key identity, and leave real overlap to a future key-directory profile.

Scope honesty: this is more than a key-encoding refactor. The plan bundles a new v2 PKA HTTP Message Signatures profile, a possible `expires` requirement, a possible `alg` case-sensitivity break, dual-version discovery partitioning, trust-source state, and an explicit restatement of the ambiguity rule. Those are defensible v2 changes, but they must be reviewed as protocol surface, not presented as a mechanical encoding cleanup.

## Scope Boundary

In v2 core:

- TXT at `_agent.<domain>` remains canonical unless the label decision changes separately.
- Required fields remain `v`, `u`/`uri`, and `p`/`proto`.
- Optional metadata remains `a`/`auth`, `s`/`desc`, `d`/`docs`, and `e`/`dep`.
- Optional PKA remains `k`/`pka`, but its encoding changes.
- `.well-known/agent` remains a fallback, but it must be marked as TLS-hosted fallback trust, not DNS-rooted trust.

Out of v2 core:

- `prev` or signed rotation chains.
- Multi-key DNS overlap or any active-key-set RRset semantics in the current recommendation; see Open Decision #1 for the deferred AidKeySet alternative.
- PKA-Extended, request-origin signatures, DID-like metadata, WIMSE/SPIFFE/OAuth binding profiles.
- Authority keys, sequence numbers, validity windows, blockchain/IPFS/transparency logs, capability schemas.

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

That profile can use normal JWKS/WBA-style overlap: add the new key before use, keep the old key through the overlap window, remove it after expiry, and let verifiers cache/refresh by HTTP cache headers. It can optionally be anchored back to DNS `k`, but it is not required for AID v2 core endpoint proof.

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
}
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
     - Open decision: whether `alg` MUST be exactly `ed25519`, or whether clients preserve current case-insensitive behavior.
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
   - State that v2 core records hold a single key; multi-key overlap is deferred per Open Decision #1 to a future key-directory profile.

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
Signature-Input: aid-pka=("aid-challenge";req "@method";req "@target-uri";req "@authority";req "@status" "date");created=<unix>;expires=<unix>;keyid="<jwk-thumbprint>";alg="ed25519";tag="aid-pka-v2"
Signature: aid-pka=:<base64-signature>:
```

   - Rationale for including both `date` and `created`/`expires`: `date` binds the HTTP response message's freshness header, which HTTP caches, proxies, and browser security UI already validate; `created`/`expires` bind only the signature's lifecycle. Including both extends signature protection to the message-layer freshness signal.
   - The client sends `AID-Challenge: <base64url nonce>`.
   - The signature MUST bind the request challenge. The cleanest RFC 9421 way is using request components with `;req`.
   - `@status` is response-derived and MUST NOT use `;req`.
   - Using `;req` for `aid-challenge`, `@method`, `@target-uri`, and `@authority` is an intentional v2 wire-format break from the current SDK signature-base construction in `packages/aid/src/pka.ts`.
   - The verifier MUST rebuild the signature base using the request/response context, compare unquoted `keyid` to the derived thumbprint, enforce freshness, and verify Ed25519 with the decoded `k`.
   - Keep raw `keyid` syntax when rebuilding `@signature-params`; compare normalized unquoted value for equality.
   - Decide whether `expires` is mandatory. Recommendation: mandatory in v2 to remove ambiguity around freshness windows.

10. Appendix D.1 Key Format Interoperability
   - Simplify: no conversion from multibase is needed in v2 because `k` is already JWK `x`.
   - Keep v1 conversion as migration guidance, not v2 key format.

11. Appendix E `.well-known` Fallback
   - State that DNS-discovered records have `trustSource=dns`.
   - State that fallback-discovered records have `trustSource=well-known-tls`.
   - PKA over fallback proves consistency with TLS-hosted metadata, not DNS-published external trust.
   - `.well-known` JSON for v2 mirrors v2 keys and must not require `i`.

12. References
   - Keep RFC 7638, RFC 8037, RFC 9421.
   - Add any RFC 9421 response-signature details needed for `;req`, `@authority`, and `@status` references.

## Proposed Normative Language

Use this language as the starting point for spec edits.

### PKA Key Format

For AID v2, the `pka` (`k`) value, when present, **MUST** be the unpadded base64url encoding of the raw 32-octet Ed25519 public key. The value is exactly the `x` member of the RFC 8037 OKP JWK:

```json
{"kty":"OKP","crv":"Ed25519","x":"<k>"}
```

Clients **MUST** reject an AID v2 `k` value that is padded, contains characters outside the base64url alphabet, or does not decode to exactly 32 octets.

### Derived Key Identity

For AID v2 PKA, clients and servers **MUST** compute the expected HTTP Message Signature `keyid` as the RFC 7638 JWK Thumbprint using SHA-256 over this exact UTF-8 JSON serialization:

```json
{"crv":"Ed25519","kty":"OKP","x":"<k>"}
```

The resulting SHA-256 digest **MUST** be encoded as unpadded base64url. Implementations **MUST NOT** hash the raw public key bytes directly for `keyid`.

### DNS `kid` Removal

AID v2 records **MUST NOT** use DNS `kid` (`i`) for endpoint proof. The key identity is derived from `k`. AID v2 clients **MUST NOT** compare HTTP Message Signature `keyid` to a DNS `kid` value.

Open compatibility decision: whether a v2 record containing `kid`/`i` is invalid or ignored as an unknown key. Recommendation: make it invalid when recognized, because the field has a known legacy meaning that is unsafe to silently carry into v2.

### Signature Algorithm

Candidate strict v2 language: For AID v2 PKA, the HTTP Message Signature `alg` parameter **MUST** be exactly `ed25519`. Clients **MUST** reject other values, including case variants.

This is a deliberate behavior change from the current TypeScript SDK, which lowercases `alg` before comparison in `packages/aid/src/pka.ts` and therefore accepts values such as `Ed25519`. Keep this as an open decision until reviewers confirm whether v2 should be stricter than current implementations.

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
4. Add `alg` case-sensitivity vector:
   - `alg="ed25519"` passes.
   - `alg="Ed25519"` fails if exact lowercase is confirmed.
5. Add stale `i`/`kid` vector after compatibility decision:
   - recommended expected result: `ERR_INVALID_TXT`.
6. Add migration/discovery vectors:
   - one valid `aid1` plus one valid `aid2` at the same name selects `aid2`.
   - two valid `aid2` records remains ambiguity.
   - one valid `aid2` plus malformed `aid2` still succeeds if exactly one valid selected-version record exists.
   - no valid `aid2`, one valid `aid1` may fallback by policy.

Vector retention strategy: keep existing v1 vectors and add new v2 vectors. Use a flat discriminated array, with each entry carrying `"v": "aid1" | "aid2"` as a discriminant. This matches the discriminated union API recommended in Open Decision #7 (`AidRecord = AidRecordV1 | AidRecordV2`), so on-disk fixtures and in-code types share one shape with no translation.

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
- Parser validation is version-dependent: in `aid1`, `pka` REQUIRES `kid` (current behavior at `packages/aid/src/parser.ts:275-277`); in `aid2`, `pka` does not require `kid`. Whether `kid`/`i` presence in an `aid2` record is invalid or silently ignored is Open Decision #2; the parser branch differs accordingly (active reject vs strip-and-warn).
- Implement one shared helper for base64url decode and RFC 7638 thumbprint derivation.
- Change `performPKAHandshake(uri, pka, kid)` to `performPKAHandshake(uri, pka)` for v2.
- Keep v1 handshake path if supporting `aid1` in the same package.
- Update Node and browser discovery selection logic.
- Update downgrade state from `{pka,kid}` to version/trust/key thumbprint state.

Complexity:

- Browser and Node implementations duplicate discovery logic.
- Current parser ignores unknown keys, so stale `i` behavior needs explicit tests.
- Current `alg` comparison lowercases before compare; v2 exact lowercase must be enforced if accepted.

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
- Decide whether UI supports both v1 and v2 modes during migration.

### Docs

Core docs with old semantics:

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

- Update v2 normative docs in the same PR as spec draft.
- Keep v1 compatibility notes clear and separate.
- Do not overclaim PKA as authorization or workload identity.

## Open Decisions Before Implementation

1. DNS multi-key RRsets
   - `v2-change-plan-v2.md` left this open as an optional overlap mechanism.
   - Recommendation: keep out of v2 core and solve managed rotation in a WBA/JWKS-style HTTP key-directory profile if needed.
   - If accepted for v2 core anyway, define `AidKeySet`, normalized non-key equivalence, key selection by derived `keyid`, RRset TTL handling, duplicate dedupe, and truncated-answer failure before any SDK work.

2. `kid`/`i` in a v2 record
   - Recommendation: invalid when recognized.
   - Alternative: ignore as unknown. Lower friction but lets stale examples pass unnoticed.

3. PKA signature base
   - Recommendation: use RFC 9421 response signature with request components using `;req` for request-derived fields and response-derived `@status` without `;req`.
   - Candidate covered components: `"aid-challenge";req`, `"@method";req`, `"@target-uri";req`, `"@authority";req`, `"@status"`, and `"date"`.
   - This is a v2 wire-format break from current SDK semantics and must be tested end-to-end before spec PR circulation.
   - Must be reviewed carefully against RFC 9421 before implementation.

4. `alg` case sensitivity
   - Recommendation: exact `ed25519`, case-sensitive.
   - Current TS SDK lowercases before compare, so this reverses existing behavior and needs vectors and reviewer signoff.

5. Enterprise policy placement
   - Recommendation: keep minimal policy semantics normative, move detailed presets/runbooks to Reference docs.

6. `.well-known` v2 status
   - Recommendation: keep fallback, but mark `trustSource=well-known-tls`.
   - Do not use fallback language to support the DNS-rooted external trust-anchor claim.

7. Dual-version API shape
   - Decide whether packages expose a union `AidRecord = AidRecordV1 | AidRecordV2` or separate explicit parser functions.
   - Recommendation: use versioned types internally and expose a union with discriminant `v`.

8. aid-doctor cache migration
   - Current on-disk cache stores `{lastSeen,pka,kid,hash?}`.
   - Recommendation: add a schema version, read old cache entries, derive/store v2 thumbprints when possible, and write the new shape without deleting existing memory.
   - Cache migration MUST backfill JWK thumbprints for any pre-existing `aid1` cache entries that carry `pka`, so the first v2 read of a previously-seen domain does not register a false key-replacement event.

9. Future key-directory profile boundary
   - Recommendation: document a non-core future profile that uses a WBA/JWKS-style HTTP key directory with `kid`, `x`, `nbf`, `exp`, `use`, caching, and overlap.
   - Do not make this profile a v2 implementation prerequisite.

10. Label strategy
   - Keep `_agent` in the draft.
   - Acknowledge the 2026-04-27 RFC 8552 `_agent` rejection.
   - Treat `_aid` or other label changes as independent from PKA cleanup and pending WG/BoF direction.

## Risks

- Overclaiming risk: PKA proves domain-published endpoint/key control, not authorization, delegation, internal workload identity, reputation, or human authority.
- RFC 9421 correctness risk: v1 implementation and prose are too loose. v2 must specify the signature base precisely.
- Reviewer-easy-error risk: invalid `;req` placement or ambiguous derived-component targets will undermine review even if the broader design is right.
- Rotation-scope risk: adding DNS rotation semantics would change the whole discovery result model. Keeping rotation out of core is the cleanest way to ship v2.
- Version migration risk: publishing `aid1` and `aid2` side by side only works if clients partition records by version before ambiguity checks.
- Silent legacy-field risk: if `i` becomes unknown and ignored, operators may think v1 rotation labels still matter.
- Cross-language drift risk: every SDK must derive thumbprints exactly the same way. Central vectors are mandatory.
- Trust-source confusion: `.well-known` fallback must not be described as DNS-rooted trust.
- Tooling drift risk: aid-doctor, aid-engine, web generator, live PKA demo, examples, and docs all currently teach `z...;i=g1`.

## Reviewer Questions

Ask reviewers these concrete questions:

1. Do you accept keeping DNS multi-key RRsets out of v2 core after considering the active-key-set alternative?
2. Should `kid`/`i` in a v2 record be invalid, or ignored as unknown?
3. Is the proposed RFC 9421 `aid-pka` response signature shape correct and implementable?
4. Should `expires` be mandatory in v2 PKA responses?
5. Should `alg` be exactly lowercase `ed25519`, or case-insensitive like current SDK behavior?
6. Should enterprise policy presets remain normative in the core spec?
7. Is the `trustSource=dns` vs `trustSource=well-known-tls` distinction sufficient for fallback?
8. Is side-by-side `aid1`/`aid2` publication with version partitioning acceptable for migration?
9. Is the `_agent` label note sufficient for IETF circulation while the label decision remains decoupled from PKA cleanup?
10. Is the future WBA/JWKS-style key-directory boundary clear enough, or should the v2 spec include a short non-normative appendix?

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
