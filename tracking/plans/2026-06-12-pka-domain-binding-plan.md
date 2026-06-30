# PKA Domain Binding (Optional Profile) Implementation Plan

> **SUPERSEDED:** This plan preserves the first design pass for history only. The active contract is the one-tag model in `2026-06-14-one-tag-simplification-plan.md`: `tag="aid-pka-v2"` is used for both bound and unbound proofs, and domain binding is indicated by signed coverage of `"aid-domain";req`.

> **DO NOT IMPLEMENT THIS PLAN.** The agent instructions and task checkboxes below are historical notes for reconstructing the old two-tag rollout, not current work guidance.

> **Historical agent instructions:** This superseded plan originally required superpowers:subagent-driven-development or superpowers:executing-plans and checkbox tracking. Keep this text only as archive context.

**Goal:** Close the unauthorized-association gap in AID v2 PKA — any domain can today publish another operator's endpoint URI and public key and the endpoint proof still verifies — by adding an optional profile where the client sends the queried domain in an `AID-Domain` request header and the endpoint covers it in the RFC 9421 response signature (`tag="aid-pka-v2-db"`), so endpoints can refuse to attest for domains they don't serve.

**Architecture:** No DNS wire-format change — the record stays `v=aid2` and no parser changes are needed. The change is HTTP-profile-only: one new covered request component (`"aid-domain";req`), one new tag value, and a `domainBound` flag on results. The client always requests the bound profile during discovery; servers that don't support it respond with the existing `aid-pka-v2` shape, which remains a valid (unbound) proof. Negotiation rides on the existing `Accept-Signature` mechanism.

**Tech Stack:** TypeScript (packages/aid, vitest), Node `crypto`/WebCrypto Ed25519, RFC 9421 HTTP Message Signatures, shared vectors in `protocol/pka_vectors.json`, Next.js demo route, e2e mock servers.

**Scope note (sub-projects):** This plan covers spec text, shared vectors, the TypeScript reference SDK, the web demo endpoint, and e2e. Two follow-up plans are deliberately out of scope and should be written after this lands: (1) non-TS SDK parity (Go/Python/Rust/.NET/Java against the new vectors — safe to defer: all their vector tests filter `record.v == "aid1"` or select vectors by exact id, so the new fixtures do not break their CI), and (2) tooling/UX surfacing (aid-doctor output + cache field, workbench badge, `identity_pka.md` docs).

**Design decisions (locked):**

| Decision                | Value                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request header          | `AID-Domain`                                                                                                                                                                                                                                                                                 |
| Header value            | canonicalized queried domain: lowercase, A-label (the discovery layer already produces A-labels via `normalizeDomain`), no trailing dot, no port                                                                                                                                             |
| Covered component       | `"aid-domain";req`, placed between `"@authority";req` and `"@status"`                                                                                                                                                                                                                        |
| Tag for bound responses | `aid-pka-v2-db` (`aid-pka-v2` unchanged; not `aid-pka-v3`, to avoid implying a record-format v3)                                                                                                                                                                                             |
| Refusal                 | server responds without `Signature-Input` (e.g. 403) → client's existing "Missing signature headers" `ERR_SECURITY` path; no new error code                                                                                                                                                  |
| Client behavior         | when a domain is known (always, during discovery), send `AID-Domain` + request the db shape; accept db-tag responses as `domainBound: true` and plain-v2-tag responses as `domainBound: false`; reject db-tag responses that don't cover `aid-domain` or that arrive when no domain was sent |
| API                     | `performPKAHandshake(uri, pka, kid?, domain?)` now returns `Promise<PKAHandshakeResult>` (`{ domainBound: boolean }`); `DiscoveryResult` gains optional `pka?: PKAHandshakeResult`                                                                                                           |

**Precomputed signatures** (Ed25519 seed `AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=`, same deterministic key as the existing v2 vectors — both values verified against the signature bases in Task 2):

- domain-bound pass vector: `IFpCJEQDXBHi7cs92Zm/DIHanJ1wlhdyKHy3fj48LV8k4cp8RPn/VmltrYuE64cfvqX825xw+qtUPXAsk+80CQ==`
- db-tag-without-coverage fail vector: `/KvRsdnIHSUp/aMK+82dE2MtoLbo0qVWKk9hF/lFi9NW2eiljPxZIgY0HXOddhEdwTu7m1NTAHDM1CTA425DCA==`

---

### Task 1: Spec text — unauthorized-association note + Appendix B.7 profile

**Files:**

- Modify: `packages/docs/specification.md` (sections 3.1, 3.2, B.6; new B.7)
- Modify: `packages/docs/Reference/versioning.md` (v2.0.0 feature list)
- Modify (generated): `packages/docs/export-manifest.json`, `packages/docs/export-manifest.sha256`

- [ ] **Step 1: Extend the "PKA does not prove" list in §3.1**

In `packages/docs/specification.md`, replace:

```markdown
- that a key change is cryptographically continuous with a previous key.
```

with:

```markdown
- that a key change is cryptographically continuous with a previous key;
- that the endpoint consents to serve as the agent for the queried domain.

Because the response signature binds only the endpoint's own request context, any domain can publish a record containing another operator's endpoint URI and public key, and the endpoint proof still verifies. This _unauthorized association_ does not let the publishing domain impersonate the endpoint, but it falsely implies a relationship between the domain and the endpoint. Clients that need the endpoint's consent to the association use the optional domain-binding profile in Appendix B.7.
```

- [ ] **Step 2: Add the mitigation line in §3.2**

In the "Mitigations provided:" list, after the line `- **Endpoint impersonation:** PKA endpoint proof with Ed25519 HTTP Message Signatures.`, insert:

```markdown
- **Unauthorized association:** the optional domain-binding profile (Appendix B.7), when supported by the endpoint.
```

- [ ] **Step 3: Amend verifier summary B.6 item 3**

Replace:

```markdown
3. the covered components and `tag="aid-pka-v2"` match this profile;
```

with:

```markdown
3. the covered components and tag match this profile — `tag="aid-pka-v2"` with the four components above, or `tag="aid-pka-v2-db"` with the additional `"aid-domain";req` component per the domain-binding profile in Appendix B.7;
```

- [ ] **Step 4: Add Appendix B.7 (after B.6, before Appendix C)**

````markdown
### **B.7. Domain Binding (Optional Profile)**

This optional profile lets an endpoint prove that it consents to serve as the agent for the queried domain, addressing the unauthorized-association gap described in Section 3.1.

A client requesting domain binding sends the canonicalized queried domain in the `AID-Domain` request header and requests an extended response signature:

```http
AID-Domain: example.com
Accept-Signature: aid-pka=("@method";req "@target-uri";req "@authority";req "aid-domain";req "@status");created;expires;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2-db"
```
````

The `AID-Domain` value is the queried domain in A-label form, lowercase, without a trailing dot or port.

A server that supports this profile and serves the named domain responds with the Appendix B.3 shape, except that the covered components include `"aid-domain";req` after `"@authority";req` and the tag is `aid-pka-v2-db`. The `aid-domain` component is the request header field, so the signature binds the exact value the client sent.

A server that supports this profile but does not serve the named domain **MUST NOT** produce a signature covering that `AID-Domain` value. It SHOULD respond with status `403` and no `Signature-Input` header. A server that does not support this profile ignores the header and responds with the base Appendix B.3 shape (`tag="aid-pka-v2"`), which remains a valid endpoint proof without domain binding.

Verifier rules, in addition to Appendix B.6:

1. A response with `tag="aid-pka-v2-db"` **MUST** cover `"aid-domain";req`, and the signature base is constructed with the exact `AID-Domain` value the client sent. A response with `tag="aid-pka-v2"` **MUST NOT** cover `aid-domain`.
2. A client that did not send `AID-Domain` **MUST** reject a `tag="aid-pka-v2-db"` response.
3. Clients **SHOULD** surface whether the accepted proof was domain-bound, and MAY require domain binding by local policy.

Domain binding is a statement by the endpoint that it serves the named domain. It does not prove authorization, delegation, or organizational identity.

````

- [ ] **Step 5: Add a bullet to the v2.0.0 feature list in `packages/docs/Reference/versioning.md`**

```markdown
- Optional PKA domain-binding profile (Appendix B.7): `AID-Domain` request header and `aid-pka-v2-db` tag let an endpoint consent to — or refuse — serving as the agent for the queried domain. Clients report `domainBound` on discovery results.
````

- [ ] **Step 6: Regenerate the docs export manifest and verify**

Run: `pnpm docs:export && pnpm docs:verify`
Expected: exits 0; `git status` shows `export-manifest.json` and `export-manifest.sha256` modified.

- [ ] **Step 7: Commit**

```bash
git add packages/docs/specification.md packages/docs/Reference/versioning.md packages/docs/export-manifest.json packages/docs/export-manifest.sha256
git commit -m "docs(spec): describe unauthorized association and add PKA domain-binding profile (B.7)"
```

---

### Task 2: Shared test vectors

**Files:**

- Modify: `protocol/pka_vectors.json` (append two entries to the `vectors` array, after `v2-ipv6-authority`)

Safety note: TS `pka.vectors.test.ts` filters `record.v === 'aid1'`, Go `pka_vectors_test.go:171` skips non-`aid1`, .NET `PkaTests.cs:181` skips non-`aid1`, and Python/Rust/Java/.NET-v2 select vectors by exact id — so these additions break no existing suite.

- [ ] **Step 1: Append the pass vector**

```json
{
  "id": "v2-db-rfc9421-domain-bound",
  "desc": "Valid AID v2 domain-bound response signature: aid-domain covered with ;req and tag aid-pka-v2-db",
  "record": {
    "v": "aid2",
    "u": "https://api.example.com/mcp?check=1",
    "p": "mcp",
    "k": "ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ"
  },
  "key": {
    "public_x": "ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ",
    "jwk_thumbprint": "WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk",
    "seed_b64": "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA="
  },
  "domain": "example.com",
  "request": {
    "method": "GET",
    "target_uri": "https://api.example.com/mcp?check=1",
    "authority": "api.example.com",
    "aid_domain": "example.com",
    "accept_signature": "aid-pka=(\"@method\";req \"@target-uri\";req \"@authority\";req \"aid-domain\";req \"@status\");created;expires;keyid=\"WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk\";alg=\"ed25519\";nonce=\"oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8\";tag=\"aid-pka-v2-db\"",
    "cache_control": "no-store"
  },
  "response": {
    "status": 401,
    "cache_control": "no-store",
    "signature_input": "aid-pka=(\"@method\";req \"@target-uri\";req \"@authority\";req \"aid-domain\";req \"@status\");created=1767139200;expires=1767139260;keyid=\"WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk\";alg=\"ed25519\";nonce=\"oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8\";tag=\"aid-pka-v2-db\"",
    "signature": "aid-pka=:IFpCJEQDXBHi7cs92Zm/DIHanJ1wlhdyKHy3fj48LV8k4cp8RPn/VmltrYuE64cfvqX825xw+qtUPXAsk+80CQ==:"
  },
  "covered": ["@method;req", "@target-uri;req", "@authority;req", "aid-domain;req", "@status"],
  "signature_base": "\"@method\";req: GET\n\"@target-uri\";req: https://api.example.com/mcp?check=1\n\"@authority\";req: api.example.com\n\"aid-domain\";req: example.com\n\"@status\": 401\n\"@signature-params\": (\"@method\";req \"@target-uri\";req \"@authority\";req \"aid-domain\";req \"@status\");created=1767139200;expires=1767139260;keyid=\"WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk\";alg=\"ed25519\";nonce=\"oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8\";tag=\"aid-pka-v2-db\"",
  "created": 1767139200,
  "expires": 1767139260,
  "nonce": "oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8",
  "expect": "pass"
}
```

- [ ] **Step 2: Append the fail vector**

```json
{
  "id": "v2-db-missing-aid-domain-coverage",
  "desc": "Response uses tag aid-pka-v2-db but does not cover aid-domain and must be rejected",
  "record": {
    "v": "aid2",
    "u": "https://api.example.com/mcp?check=1",
    "p": "mcp",
    "k": "ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ"
  },
  "key": {
    "public_x": "ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ",
    "jwk_thumbprint": "WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk",
    "seed_b64": "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA="
  },
  "domain": "example.com",
  "request": {
    "method": "GET",
    "target_uri": "https://api.example.com/mcp?check=1",
    "authority": "api.example.com",
    "aid_domain": "example.com",
    "accept_signature": "aid-pka=(\"@method\";req \"@target-uri\";req \"@authority\";req \"aid-domain\";req \"@status\");created;expires;keyid=\"WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk\";alg=\"ed25519\";nonce=\"oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8\";tag=\"aid-pka-v2-db\"",
    "cache_control": "no-store"
  },
  "response": {
    "status": 401,
    "cache_control": "no-store",
    "signature_input": "aid-pka=(\"@method\";req \"@target-uri\";req \"@authority\";req \"@status\");created=1767139200;expires=1767139260;keyid=\"WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk\";alg=\"ed25519\";nonce=\"oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8\";tag=\"aid-pka-v2-db\"",
    "signature": "aid-pka=:/KvRsdnIHSUp/aMK+82dE2MtoLbo0qVWKk9hF/lFi9NW2eiljPxZIgY0HXOddhEdwTu7m1NTAHDM1CTA425DCA==:"
  },
  "covered": ["@method;req", "@target-uri;req", "@authority;req", "@status"],
  "signature_base": "\"@method\";req: GET\n\"@target-uri\";req: https://api.example.com/mcp?check=1\n\"@authority\";req: api.example.com\n\"@status\": 401\n\"@signature-params\": (\"@method\";req \"@target-uri\";req \"@authority\";req \"@status\");created=1767139200;expires=1767139260;keyid=\"WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk\";alg=\"ed25519\";nonce=\"oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8\";tag=\"aid-pka-v2-db\"",
  "created": 1767139200,
  "expires": 1767139260,
  "nonce": "oKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr8",
  "expect": "fail"
}
```

- [ ] **Step 3: Verify the signatures match the signature bases**

Run from the repo root:

```bash
node -e "
const fs=require('fs'),crypto=require('crypto');
const vf=JSON.parse(fs.readFileSync('protocol/pka_vectors.json','utf8'));
for(const id of ['v2-db-rfc9421-domain-bound','v2-db-missing-aid-domain-coverage']){
  const v=vf.vectors.find(x=>x.id===id);
  const seed=Buffer.from(v.key.seed_b64,'base64');
  const header=Buffer.from([0x30,0x2e,0x02,0x01,0x00,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x04,0x22,0x04,0x20]);
  const key=crypto.createPrivateKey({key:Buffer.concat([header,seed]),format:'der',type:'pkcs8'});
  const sig=Buffer.from(/:(.+):/.exec(v.response.signature)[1],'base64');
  console.log(id, crypto.verify(null,Buffer.from(v.signature_base,'utf8'),crypto.createPublicKey(key),sig));
}"
```

Expected output:

```
v2-db-rfc9421-domain-bound true
v2-db-missing-aid-domain-coverage true
```

- [ ] **Step 4: Confirm existing suites still pass with the new fixtures**

Run: `pnpm -C packages/aid test`
Expected: 135 tests pass (the parity test filters to `aid1`, so counts are unchanged).

- [ ] **Step 5: Commit**

```bash
git add protocol/pka_vectors.json
git commit -m "test(protocol): add domain-binding PKA vectors (aid-pka-v2-db)"
```

---

### Task 3: TypeScript verifier — the domain-binding profile in pka.ts

**Files:**

- Modify: `packages/aid/src/pka.ts`
- Create: `packages/aid/src/pka.v2db.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/aid/src/pka.v2db.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalizeAidDomain, performPKAHandshake } from './pka.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

type DbVector = {
  id: string;
  record: { v: 'aid2'; u: string; p: string; k: string };
  domain?: string;
  request: {
    method: 'GET';
    target_uri: string;
    authority: string;
    aid_domain?: string;
    accept_signature: string;
    cache_control: string;
  };
  response: {
    status: number;
    cache_control: string;
    signature_input: string;
    signature: string;
  };
  created: number;
  expires: number;
  nonce: string;
  expect: 'pass' | 'fail';
};

function loadVector(id: string): DbVector {
  const p = path.resolve(process.cwd(), '..', '..', 'protocol', 'pka_vectors.json');
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw) as { vectors: Array<DbVector | { id: string }> };
  const vector = parsed.vectors.find((item): item is DbVector => item.id === id);
  if (!vector) throw new Error(`missing PKA vector: ${id}`);
  return vector;
}

describe('AID v2 PKA domain binding', () => {
  const g = globalThis as unknown as {
    fetch?: unknown;
    crypto?: Crypto & { getRandomValues: Crypto['getRandomValues'] };
  };
  let originalFetch: unknown;
  let getRandomValuesSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    originalFetch = g.fetch;
  });

  afterEach(() => {
    g.fetch = originalFetch;
    getRandomValuesSpy?.mockRestore();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mockVectorResponse(
    vector: DbVector,
    assertRequest?: (url: string, init?: { headers?: Record<string, string> }) => void,
  ): void {
    const nonceBytes = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 160 + index));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(vector.created * 1000));
    getRandomValuesSpy = vi.spyOn(g.crypto!, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).set(nonceBytes);
      return array;
    });

    g.fetch = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      assertRequest?.(url, init);
      return {
        ok: false,
        status: vector.response.status,
        headers: {
          get: (name: string) => {
            const normalized = name.toLowerCase();
            if (normalized === 'signature-input') return vector.response.signature_input;
            if (normalized === 'signature') return vector.response.signature;
            if (normalized === 'cache-control') return vector.response.cache_control;
            return null;
          },
        },
        text: async () => '',
      };
    });
  }

  it('verifies the canonical domain-bound vector and reports domainBound', async () => {
    const vector = loadVector('v2-db-rfc9421-domain-bound');
    mockVectorResponse(vector, (url, init) => {
      expect(url).toBe(vector.request.target_uri);
      expect(init?.headers?.['AID-Domain']).toBe(vector.request.aid_domain);
      expect(init?.headers?.['Accept-Signature']).toBe(vector.request.accept_signature);
    });

    await expect(
      performPKAHandshake(vector.record.u, vector.record.k, undefined, vector.domain),
    ).resolves.toEqual({ domainBound: true });
  });

  it('accepts a plain v2 response to a domain-bound request and reports domainBound=false', async () => {
    const vector = loadVector('v2-rfc9421-response-signature');
    mockVectorResponse(vector);

    await expect(
      performPKAHandshake(vector.record.u, vector.record.k, undefined, 'example.com'),
    ).resolves.toEqual({ domainBound: false });
  });

  it('rejects a db-tagged response that does not cover aid-domain', async () => {
    const vector = loadVector('v2-db-missing-aid-domain-coverage');
    mockVectorResponse(vector);

    await expect(
      performPKAHandshake(vector.record.u, vector.record.k, undefined, vector.domain),
    ).rejects.toThrow('Signature-Input must cover required fields');
  });

  it('rejects an unrequested domain-bound response', async () => {
    const vector = loadVector('v2-db-rfc9421-domain-bound');
    mockVectorResponse(vector);

    await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toThrow(
      'Unrequested domain-bound signature tag',
    );
  });

  it('rejects when the signed domain differs from the sent domain', async () => {
    const vector = loadVector('v2-db-rfc9421-domain-bound');
    mockVectorResponse(vector);

    await expect(
      performPKAHandshake(vector.record.u, vector.record.k, undefined, 'evil.example'),
    ).rejects.toThrow('PKA signature verification failed');
  });

  it('canonicalizes AID-Domain values', () => {
    expect(canonicalizeAidDomain(' Example.COM. ')).toBe('example.com');
    expect(canonicalizeAidDomain('127.0.0.1')).toBe('127.0.0.1');
    expect(() => canonicalizeAidDomain('bad domain')).toThrow('Invalid AID-Domain value');
    expect(() => canonicalizeAidDomain('')).toThrow('Invalid AID-Domain value');
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm -C packages/aid exec vitest run src/pka.v2db.test.ts`
Expected: FAIL — `canonicalizeAidDomain` is not exported and `performPKAHandshake` returns `undefined`, not `{ domainBound: ... }`.

- [ ] **Step 3: Implement in `packages/aid/src/pka.ts`**

**3a.** After the `asciiLowerCase` function (around line 88), add:

```ts
export interface PKAHandshakeResult {
  /** True when the endpoint signed the AID-Domain binding for the queried domain. */
  domainBound: boolean;
}

export const AID_DOMAIN_HEADER = 'AID-Domain';
const AID_PKA_TAG_V2 = 'aid-pka-v2';
const AID_PKA_TAG_V2_DB = 'aid-pka-v2-db';

export function canonicalizeAidDomain(domain: string): string {
  let value = asciiLowerCase(domain.trim());
  if (value.endsWith('.')) value = value.slice(0, -1);
  if (!value || !/^[a-z0-9.:[\]_-]+$/.test(value)) {
    throw new AidError('ERR_SECURITY', 'Invalid AID-Domain value');
  }
  return value;
}
```

**3b.** Extend `V2CoveredItem` (currently `pka.ts:440-444`):

```ts
interface V2CoveredItem {
  raw: string;
  name: '@method' | '@target-uri' | '@authority' | '@status' | 'aid-domain';
  req: boolean;
}
```

**3c.** In `parseV2CoveredItem` (currently `pka.ts:458-473`), replace the allowed-name check:

```ts
if (!['@method', '@target-uri', '@authority', '@status', 'aid-domain'].includes(name)) {
  throw new AidError('ERR_SECURITY', `Unsupported covered field: ${name}`);
}
```

**3d.** Replace `validateV2CoveredSet` (currently `pka.ts:475-498`) entirely:

```ts
function validateV2CoveredSet(covered: V2CoveredItem[], domainBound: boolean): void {
  const expected = new Map<V2CoveredItem['name'], boolean>([
    ['@method', true],
    ['@target-uri', true],
    ['@authority', true],
    ['@status', false],
  ]);
  if (domainBound) expected.set('aid-domain', true);

  if (covered.length !== expected.size) {
    throw new AidError('ERR_SECURITY', 'Signature-Input must cover required fields');
  }

  const seen = new Set<string>();
  for (const item of covered) {
    if (seen.has(item.name) || expected.get(item.name) !== item.req) {
      throw new AidError('ERR_SECURITY', 'Signature-Input must cover required fields');
    }
    seen.add(item.name);
  }

  if (seen.size !== expected.size) {
    throw new AidError('ERR_SECURITY', 'Signature-Input must cover required fields');
  }
}
```

**3e.** In `parseV2SignatureHeaders` (currently `pka.ts:500-552`): delete the early `validateV2CoveredSet(covered);` call (line 514) so covered items are parsed but not yet validated, and after the `if (!/^\d+$/.test(createdRaw) ...)` timestamp check, insert:

```ts
validateV2CoveredSet(covered, tag === AID_PKA_TAG_V2_DB);
```

**3f.** In `buildV2SignatureBase` (currently `pka.ts:577-591`), change the `ctx` parameter type to `{ method: string; targetUri: string; authority: string; status: number; aidDomain?: string }` and add inside the loop, after the `@authority` line:

```ts
if (item.name === 'aid-domain') {
  if (ctx.aidDomain === undefined) {
    throw new AidError('ERR_SECURITY', 'Signature covers aid-domain but no AID-Domain was sent');
  }
  lines.push(`"aid-domain";req: ${ctx.aidDomain}`);
}
```

**3g.** Replace `buildAcceptSignatureV2` (currently `pka.ts:607-609`):

```ts
function buildAcceptSignatureV2(keyid: string, nonce: string, domainBound: boolean): string {
  const covered = domainBound
    ? '("@method";req "@target-uri";req "@authority";req "aid-domain";req "@status")'
    : '("@method";req "@target-uri";req "@authority";req "@status")';
  const tag = domainBound ? AID_PKA_TAG_V2_DB : AID_PKA_TAG_V2;
  return `aid-pka=${covered};created;expires;keyid="${keyid}";alg="ed25519";nonce="${nonce}";tag="${tag}"`;
}
```

**3h.** Change `performV2PKAHandshake` (currently `pka.ts:669-736`):

- Signature: `async function performV2PKAHandshake(uri: string, pka: string, domain?: string): Promise<PKAHandshakeResult> {`
- After `const { publicKey, keyid: expectedKeyid } = ...`, add:
  ```ts
  const canonicalDomain = domain === undefined ? undefined : canonicalizeAidDomain(domain);
  ```
- Replace the fetch `headers` object:
  ```ts
      headers: {
        'Accept-Signature': buildAcceptSignatureV2(expectedKeyid, nonce, canonicalDomain !== undefined),
        'Cache-Control': 'no-store',
        ...(canonicalDomain !== undefined ? { [AID_DOMAIN_HEADER]: canonicalDomain } : {}),
      },
  ```
- Replace the tag check (currently `pka.ts:721-723`):
  ```ts
  const isDomainBound = timingSafeEqual(parsed.tag, AID_PKA_TAG_V2_DB);
  if (!isDomainBound && !timingSafeEqual(parsed.tag, AID_PKA_TAG_V2)) {
    throw new AidError('ERR_SECURITY', 'Invalid signature tag');
  }
  if (isDomainBound && canonicalDomain === undefined) {
    throw new AidError('ERR_SECURITY', 'Unrequested domain-bound signature tag');
  }
  ```
- Replace the `buildV2SignatureBase` call's context argument:
  ```ts
  const base = buildV2SignatureBase(parsed.covered, parsed.signatureParamsRaw, {
    method: 'GET',
    targetUri: requestUri,
    authority,
    status: res.status,
    ...(canonicalDomain !== undefined ? { aidDomain: canonicalDomain } : {}),
  });
  ```
- Replace the final `if (!ok) throw ...;` ending so the function returns:
  ```ts
  if (!ok) throw new AidError('ERR_SECURITY', 'PKA signature verification failed');
  return { domainBound: isDomainBound };
  ```

**3i.** Replace the exported `performPKAHandshake` (currently `pka.ts:738-744`):

```ts
export async function performPKAHandshake(
  uri: string,
  pka: string,
  kid?: string,
  domain?: string,
): Promise<PKAHandshakeResult> {
  if (kid !== undefined) {
    await performV1PKAHandshake(uri, pka, kid);
    return { domainBound: false };
  }
  return await performV2PKAHandshake(uri, pka, domain);
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `pnpm -C packages/aid exec vitest run src/pka.v2db.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Run the full package suite to verify no regressions**

Run: `pnpm -C packages/aid test`
Expected: all tests pass (135 existing + 6 new). The existing `pka.v2.test.ts` canonical test asserts the exact plain `Accept-Signature` string for calls without a domain — it must still pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/aid/src/pka.ts packages/aid/src/pka.v2db.test.ts
git commit -m "feat(aid): verify optional PKA domain-binding profile (aid-pka-v2-db)"
```

---

### Task 4: Thread the queried domain through discovery and expose `domainBound`

**Files:**

- Modify: `packages/aid/src/client.ts`
- Modify: `packages/aid/src/browser.ts`
- Create: `packages/aid/src/client.pka.domain.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `packages/aid/src/client.pka.domain.integration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discover } from './index.js';
import { webcrypto as nodeWebcrypto } from 'node:crypto';

// Force DNS miss to drive the well-known fallback path
vi.mock('dns-query', () => ({
  query: vi.fn(async () => {
    const err: Error & { code?: string } = new Error('ENOTFOUND');
    err.code = 'ENOTFOUND';
    throw err;
  }),
}));

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

async function jwkThumbprint(x: string): Promise<string> {
  const input = `{"crv":"Ed25519","kty":"OKP","x":"${x}"}`;
  const digest = await nodeWebcrypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return b64url(new Uint8Array(digest));
}

describe('PKA domain binding integration', () => {
  const g = globalThis as any;
  let origFetch: any;

  beforeEach(() => {
    origFetch = g.fetch;
  });
  afterEach(() => {
    g.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('discovers an aid2 record and reports a domain-bound proof', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const x = b64url(rawPub);
    const keyid = await jwkThumbprint(x);
    let sawAidDomain: string | undefined;

    g.fetch = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (url.includes('/.well-known/agent')) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null),
          },
          text: async () =>
            JSON.stringify({ v: 'aid2', u: 'https://api.example.com/mcp', p: 'mcp', k: x }),
        };
      }
      sawAidDomain = init?.headers?.['AID-Domain'];
      const accept = init?.headers?.['Accept-Signature'] ?? '';
      const nonce = /nonce="([^"]+)"/.exec(accept)?.[1] ?? '';
      const created = Math.floor(Date.now() / 1000);
      const expires = created + 60;
      const params = `("@method";req "@target-uri";req "@authority";req "aid-domain";req "@status");created=${created};expires=${expires};keyid="${keyid}";alg="ed25519";nonce="${nonce}";tag="aid-pka-v2-db"`;
      const base = [
        `"@method";req: GET`,
        `"@target-uri";req: https://api.example.com/mcp`,
        `"@authority";req: api.example.com`,
        `"aid-domain";req: ${sawAidDomain}`,
        `"@status": 200`,
        `"@signature-params": ${params}`,
      ].join('\n');
      const sig = new Uint8Array(
        await nodeWebcrypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(base)),
      );
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            const k = name.toLowerCase();
            if (k === 'signature-input') return `aid-pka=${params}`;
            if (k === 'signature') return `aid-pka=:${Buffer.from(sig).toString('base64')}:`;
            if (k === 'cache-control') return 'no-store';
            return null;
          },
        },
        text: async () => '',
      };
    });

    const result = await discover('example.com', { wellKnownFallback: true });
    expect(sawAidDomain).toBe('example.com');
    expect(result.pka).toEqual({ domainBound: true });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm -C packages/aid exec vitest run src/client.pka.domain.integration.test.ts`
Expected: FAIL — `result.pka` is `undefined` (discovery does not pass a domain, so the handshake requests the plain profile and the result has no `pka` field; the mock's db-tagged response is also rejected as unrequested).

- [ ] **Step 3: Wire through `packages/aid/src/client.ts`**

**3a.** Change the import (line 9):

```ts
import { performPKAHandshake, type PKAHandshakeResult } from './pka.js';
```

**3b.** Replace `performPKAHandshakeForRecord` (currently `client.ts:116-123`):

```ts
async function performPKAHandshakeForRecord(
  record: AidRecord,
  domain?: string,
): Promise<PKAHandshakeResult | undefined> {
  if (!record.pka) return undefined;
  if (record.v === SPEC_VERSION_V1) {
    return await performPKAHandshake(record.uri, record.pka, record.kid ?? '');
  }
  return await performPKAHandshake(record.uri, record.pka, undefined, domain);
}
```

**3c.** In `DiscoveryResult` (currently `client.ts:311-322`), add after the `security` field:

```ts
  /** PKA handshake outcome when the record carried a key. */
  pka?: PKAHandshakeResult;
```

**3d.** In `fetchWellKnown`: change the return type's object to include `pka?: PKAHandshakeResult;`, declare `let pkaResult: PKAHandshakeResult | undefined;` before the `if (record.pka)` block (currently `client.ts:276-286`), assign inside the existing try (`pkaResult = await performPKAHandshakeForRecord(record, normalizeDomain(domain));`), and change the return (currently `client.ts:289`) to:

```ts
return {
  record,
  raw: text.trim(),
  queryName: url,
  security,
  ...(pkaResult ? { pka: pkaResult } : {}),
};
```

**3e.** In `queryOnce` (currently `client.ts:412-421`), replace:

```ts
const result = selectedRecords[0];
await performPKAHandshakeForRecord(result.record);
```

with:

```ts
const result = selectedRecords[0];
const pkaResult = await performPKAHandshakeForRecord(result.record, normalizeDomain(domain));
```

and the return at the end of that block with:

```ts
return { ...result, security, ...(pkaResult ? { pka: pkaResult } : {}) };
```

**3f.** In the `discover` fallback (currently `client.ts:519-524`), destructure and forward `pka`:

```ts
const { record, raw, queryName, security, pka } = await fetchWellKnown(
  domain,
  wellKnownTimeoutMs,
  options,
);
return { record, raw, ttl: DNS_TTL_MIN, queryName, security, ...(pka ? { pka } : {}) };
```

- [ ] **Step 4: Mirror in `packages/aid/src/browser.ts`**

**4a.** Change the import (line 18):

```ts
import { performPKAHandshake, type PKAHandshakeResult } from './pka.js';
```

**4b.** Replace `performPKAHandshakeForRecord` (currently `browser.ts:143-150`) with the same implementation as client.ts 3b above.

**4c.** In `DiscoveryResult` (currently `browser.ts:60-71`), add after the `security` field:

```ts
  /** PKA handshake outcome when the record carried a key. */
  pka?: PKAHandshakeResult;
```

**4d.** In `fetchWellKnown` (currently `browser.ts:163-249`): add `pka?: PKAHandshakeResult;` to the return type object, declare `let pkaResult: PKAHandshakeResult | undefined;` before the `if (record.pka)` block (lines 223-233), assign `pkaResult = await performPKAHandshakeForRecord(record, normalizeDomain(domain));` inside the try, and change the return (line 236) to:

```ts
return {
  record,
  raw: text.trim(),
  queryName: url,
  security,
  ...(pkaResult ? { pka: pkaResult } : {}),
};
```

**4e.** In the DNS path (currently `browser.ts:393-401`), replace:

```ts
const result = selectedRecords[0];
await performPKAHandshakeForRecord(result.record);
```

with:

```ts
const result = selectedRecords[0];
const pkaResult = await performPKAHandshakeForRecord(result.record, normalizeDomain(domain));
```

and the return with:

```ts
return { ...result, security, ...(pkaResult ? { pka: pkaResult } : {}) };
```

(`domain` is the `discover` parameter and is in scope; `normalizeDomain` exists at `browser.ts:107`.)

**4f.** In the `discover` fallback (currently `browser.ts:435-441`), destructure `pka` and forward it:

```ts
const { record, queryName, security, pka } = await fetchWellKnown(
  domain,
  wellKnownTimeoutMs,
  options,
);
// well-known does not provide a TTL, so we use a sensible default.
return { record, domain, queryName, ttl: 300, security, ...(pka ? { pka } : {}) };
```

- [ ] **Step 5: Run the integration test to verify it passes**

Run: `pnpm -C packages/aid exec vitest run src/client.pka.domain.integration.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full package suite**

Run: `pnpm -C packages/aid test`
Expected: all tests pass. (The aid1 integration tests in `client.pka.integration.test.ts` now surface `pka: { domainBound: false }` on results — they only assert on `record`, so they pass unchanged.)

- [ ] **Step 7: Commit**

```bash
git add packages/aid/src/client.ts packages/aid/src/browser.ts packages/aid/src/client.pka.domain.integration.test.ts
git commit -m "feat(aid): thread queried domain through discovery and expose pka.domainBound"
```

---

### Task 5: Reference servers — demo endpoint allowlist + e2e coverage

**Files:**

- Modify: `packages/web/src/app/api/pka-demo/route.ts`
- Modify: `packages/e2e-tests/src/pka_e2e.ts`

- [ ] **Step 1: Update the demo route**

In `packages/web/src/app/api/pka-demo/route.ts`:

**1a.** After the `V2_COVERED` constant (line 12), add:

```ts
const V2_COVERED_DB =
  '("@method";req "@target-uri";req "@authority";req "aid-domain";req "@status")';

// Domains this endpoint agrees to serve as an agent for (AID domain binding).
const SERVED_DOMAINS = new Set([
  'agentcommunity.org',
  'aid.agentcommunity.org',
  'pka-basic.agentcommunity.org',
  'localhost',
  '127.0.0.1',
]);
```

**1b.** After `extractNonce` (lines 29-32), add:

```ts
function extractTag(acceptSignature: string | null): string | null {
  if (!acceptSignature) return null;
  return /(?:^|;)\s*tag="([^"]+)"/.exec(acceptSignature)?.[1] ?? null;
}
```

**1c.** In `GET`, after `const v2Nonce = extractNonce(acceptSignature);` (line 36), add:

```ts
const requestedTag = extractTag(acceptSignature);
const aidDomain = request.headers.get('aid-domain')?.trim().toLowerCase() ?? null;
const boundDomain = requestedTag === 'aid-pka-v2-db' && aidDomain !== null ? aidDomain : null;
```

**1d.** Immediately after the closing brace of the `if (!v2Nonce) { ... }` block (line 66), add the refusal path:

```ts
if (requestedTag === 'aid-pka-v2-db' && aidDomain !== null && !SERVED_DOMAINS.has(aidDomain)) {
  return NextResponse.json(
    { error: `This endpoint does not serve as the agent for ${aidDomain}.` },
    {
      status: 403,
      headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
    },
  );
}
```

**1e.** Replace the signature construction (lines 78-85):

```ts
const covered = boundDomain !== null ? V2_COVERED_DB : V2_COVERED;
const tag = boundDomain !== null ? 'aid-pka-v2-db' : 'aid-pka-v2';
const sigInputValue = `${covered};created=${nowSec};expires=${expires};keyid="${KEYID}";alg="ed25519";nonce="${v2Nonce}";tag="${tag}"`;
const lines = [
  `"@method";req: ${method}`,
  `"@target-uri";req: ${targetUri}`,
  `"@authority";req: ${authority}`,
  ...(boundDomain !== null ? [`"aid-domain";req: ${boundDomain}`] : []),
  `"@status": ${status}`,
  `"@signature-params": ${sigInputValue}`,
];
```

**1f.** In `OPTIONS`, change the allow-headers line to:

```ts
      'Access-Control-Allow-Headers': 'Accept-Signature, Cache-Control, AID-Domain',
```

- [ ] **Step 2: Add the domain-bound e2e check**

In `packages/e2e-tests/src/pka_e2e.ts`, after `runAid2PkaCheck` (line 227), add:

```ts
async function runAid2DomainBoundPkaCheck() {
  const vector = loadVectors().find((v) => v.id === 'v2-db-rfc9421-domain-bound');
  if (!vector) throw new Error('Missing v2 db vector');

  const key = vector.key as { seed_b64: string; public_x: string; jwk_thumbprint: string };
  const seed = Buffer.from(key.seed_b64, 'base64');
  const priv = crypto.createPrivateKey({
    key: seedToPkcs8Ed25519(seed),
    format: 'der',
    type: 'pkcs8',
  });

  const port = 19083;
  const domain = `127.0.0.1:${port}`;
  const targetUri = `http://${domain}/mcp?check=1`;
  const record = { v: 'aid2', u: targetUri, p: 'mcp', k: key.public_x };

  const server = http.createServer((req, res) => {
    if (!req.url) return res.writeHead(404).end();
    if (req.url === '/.well-known/agent') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(record));
      return;
    }
    if (req.url === '/mcp?check=1') {
      const acceptSignature = req.headers['accept-signature'];
      const aidDomain = req.headers['aid-domain'];
      if (typeof acceptSignature !== 'string' || typeof aidDomain !== 'string') {
        res.writeHead(400).end('missing Accept-Signature or AID-Domain');
        return;
      }
      if (aidDomain !== '127.0.0.1') {
        res.writeHead(403, { 'Cache-Control': 'no-store' }).end('domain not served');
        return;
      }
      const nonce = quotedParam(acceptSignature, 'nonce');
      const created = Math.floor(Date.now() / 1000);
      const expires = created + 60;
      const status = 401;
      const signatureInput = `aid-pka=("@method";req "@target-uri";req "@authority";req "aid-domain";req "@status");created=${created};expires=${expires};keyid="${key.jwk_thumbprint}";alg="ed25519";nonce="${nonce}";tag="aid-pka-v2-db"`;
      const signatureParams = signatureInput.replace(/^aid-pka=/, '');
      const signatureBase = [
        `"@method";req: GET`,
        `"@target-uri";req: ${targetUri}`,
        `"@authority";req: ${domain}`,
        `"aid-domain";req: ${aidDomain}`,
        `"@status": ${status}`,
        `"@signature-params": ${signatureParams}`,
      ].join('\n');

      res.writeHead(status, {
        'Signature-Input': signatureInput,
        Signature: signatureHeaderValue(priv, signatureBase),
        'Cache-Control': 'no-store',
      });
      res.end('');
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  console.log(`AID v2 domain-bound mock server listening on ${domain}`);
  await new Promise((r) => setTimeout(r, 100));

  const code = await runDoctorCheck(domain);
  server.close();
  if (code !== 0) process.exit(code || 1);
}
```

and change `main()` (lines 229-232) to:

```ts
async function main() {
  await runLegacyPkaCheck();
  await runAid2PkaCheck();
  await runAid2DomainBoundPkaCheck();
}
```

This server refuses any `AID-Domain` other than `127.0.0.1`, so the doctor run only succeeds if the client sends the header and verifies the db-tagged response end-to-end.

- [ ] **Step 3: Build and run the e2e PKA suite**

Run: `pnpm build && pnpm -C packages/e2e-tests run e2e:pka`
Expected: all three checks pass (legacy aid1, aid2, aid2 domain-bound); exit code 0.

- [ ] **Step 4 (optional, manual): Verify the demo refusal locally**

Run `pnpm dev:web`, then:

```bash
curl -si 'http://localhost:3000/api/pka-demo' \
  -H 'AID-Domain: evil.example' \
  -H 'Accept-Signature: aid-pka=("@method";req "@target-uri";req "@authority";req "aid-domain";req "@status");created;expires;keyid="sYkYRKJfa8y8rCgWHb-qxqR4LY93c_hbbL10YbvT88o";alg="ed25519";nonce="dGVzdC1ub25jZS10ZXN0LW5vbmNlLXRlc3Qtbm9uY2UtMTI";tag="aid-pka-v2-db"' | head -5
```

Expected: `HTTP/1.1 403` with `Cache-Control: no-store` and no `Signature-Input` header.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/app/api/pka-demo/route.ts packages/e2e-tests/src/pka_e2e.ts
git commit -m "feat(web,e2e): domain-binding allowlist in PKA demo and e2e mock server"
```

---

### Task 6: Changeset and full verification

**Files:**

- Create: `.changeset/pka-domain-binding.md`

- [ ] **Step 1: Add the changeset**

Create `.changeset/pka-domain-binding.md`:

```markdown
---
'@agentcommunity/aid': minor
---

Add the optional PKA domain-binding profile: discovery sends the queried domain in an `AID-Domain` header, endpoints that support the profile cover it in the RFC 9421 response signature (`tag="aid-pka-v2-db"`), and discovery results expose `pka.domainBound`. Endpoints can now refuse to attest for domains they do not serve. Plain `aid-pka-v2` responses remain valid unbound proofs.
```

- [ ] **Step 2: Full verification**

Run: `pnpm build && pnpm test && pnpm lint`
Expected: all green. Then `pnpm test:parity` — expected green (non-TS SDKs are untouched; their vector tests skip the new entries).

- [ ] **Step 3: Commit**

```bash
git add .changeset/pka-domain-binding.md
git commit -m "chore: changeset for PKA domain-binding profile"
```

---

## Follow-up plans (not in this plan)

1. **SDK parity:** implement the profile in Go, Python, Rust, .NET, Java against `v2-db-rfc9421-domain-bound` / `v2-db-missing-aid-domain-coverage`, mirroring the TS verifier rules.
2. **Tooling/UX:** aid-doctor output + cache `domainBound` field (cache schema bump 2→3 using the existing migration machinery), workbench badge, `packages/docs/Reference/identity_pka.md` section.
3. **Governance:** spec-proposal issue per `tracking/SPEC_EXTENSION_PROCESS.md` step 1 and an external security review of the canonicalization and refusal rules before announcing the profile.
