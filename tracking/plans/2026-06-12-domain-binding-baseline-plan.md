# Domain Binding as Baseline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the AID PKA domain-binding profile from "optional add-on" to the expected default across the spec, the TypeScript SDK, the CLI/engine tooling, and the web workbench — adding the enforcement lever (`domain-binding: require`) and surfacing `domainBound` everywhere, while keeping unbound proofs valid (no flag day).

**Architecture:** This builds on branch `smart/hardcore-almeida-0de44d`, which already (a) verifies `aid-pka-v2-db` in the TS SDK, (b) makes discovery always *send* `AID-Domain` for v2, and (c) surfaces `DiscoveryResult.pka.domainBound`. This plan adds the missing *teeth and visibility*: a `domain-binding: off | prefer | require` enterprise policy knob (mirroring the existing `pka`/`dnssec`/`downgrade`/`well-known` knobs), capture+display of `domainBound` in aid-doctor/aid-engine (cache schema v2→v3), the same surfacing in the web workbench, and spec text that reframes binding as the default with an explicit aid3 trajectory. No DNS record format changes; records stay `v=aid2`.

**Tech Stack:** TypeScript (packages/aid, aid-engine, aid-doctor, web — vitest), RFC 9421 HTTP Message Signatures, Markdown spec (docs export manifest), changesets.

**Design decisions (locked):**

| Decision | Value |
| --- | --- |
| Policy modes | `off` \| `prefer` \| `require` |
| Default mode | `prefer` (send `AID-Domain`, record `domainBound`, accept unbound) |
| `off` | do NOT send `AID-Domain`; `domainBinding.bound = null` |
| `prefer` | send; record `domainBound`; **no security warning** (visibility is via the result field + tooling/web badges, not warning spam) |
| `require` | send; **fail discovery (`ERR_SECURITY`)** when a PKA proof ran and `domainBound === false`; no-op when no `k`/no proof |
| `strict` preset | sets `domain-binding: require` |
| Default / `balanced` preset | `prefer` |
| Cache binding-loss (was bound, now unbound) | **warning**, not hard-fail (rollout-friendly; can escalate in aid3) |
| Cache schema | bump `2` → `3`, read-old/write-new backfill `domainBound: null` |
| aid-doctor CLI | add `--domain-binding <off|prefer|require>` flag |
| Non-TS SDK parity (Go/Py/Rust/.NET/Java) | **separate follow-up plan** — see Appendix A |

**Out of scope (separate plan):** non-TS SDK parity. The other five SDKs currently behave as non-supporting clients (never send `AID-Domain`), which is safe. Bringing them to parity is large and language-specific; Appendix A seeds that plan.

**Validation:** This plan was stress-tested by two independent clean-context reviewers (AID-standard correctness + executability-vs-real-code) and revised to fix every Critical/Important finding: `binding_loss` classification ordered after fail-eligible statuses (downgrade-evasion fix); §3.3 `require` wording aligned to the implemented trigger + honesty caveat; `resolveSecurityPolicy` two-return-path wiring; cache v2→v3 migration data-loss guard; corrected symbols (`formatCheckResult`, non-exported `formatPkaStatus`/`warningByStatus`/`FAIL_POLICY_STATUSES` tested via behavior, `client.browser.test.ts`, `vi.mocked` handle); web `verified`/`domainBound` coherence; added `off`-suppression + composition coverage; `json` command flag wiring; `.well-known` semantics note.

---

## File Structure

| File | Responsibility | Phase |
| --- | --- | --- |
| `packages/docs/specification.md` | Reframe B.7 optional→default; add §3.3 `domain-binding` knob; §2.3 SHOULD-send; aid3 trajectory note | A |
| `packages/docs/Reference/versioning.md` | v2.0.0 bullet + trajectory note | A |
| `packages/aid/src/discovery-security.ts` | `DomainBindingPolicy` type, `enforceDomainBindingPolicy`, `domainBinding` block on `DiscoverySecurity`, preset wiring | B |
| `packages/aid/src/client.ts` | `domainBindingPolicy` option; conditional send; enforcement call (DNS + well-known) | B |
| `packages/aid/src/browser.ts` | same as client.ts (DNS + well-known) | B |
| `packages/aid-engine/src/types.ts` | `domainBound` on `PkaBlock` + `CacheEntry`; `binding_loss` downgrade status | C |
| `packages/aid-engine/src/checker.ts` | capture `domainBound` from handshake into report | C |
| `packages/aid-doctor/src/cache.ts` | schema v2→v3, backfill, `buildCacheEntryFromReport`, `classifySecurityChange` binding-loss | C |
| `packages/aid-doctor/src/security-state.ts` | `binding_loss` warning mapping | C |
| `packages/aid-doctor/src/output.ts` | "domain-bound" vs "endpoint-proof only" indicator + suggestion | C |
| `packages/aid-doctor/src/cli.ts` | `--domain-binding` flag → `CheckOptions` → SDK policy | C |
| `packages/web/src/hooks/use-discovery.ts` | thread `domainBound` from SDK result into `DiscoveryMetadata.pka` | D |
| `packages/web/src/lib/datasources/live-datasource.ts` | same mapping | D |
| `packages/web/src/components/workbench/blocks/discovery-block.tsx` | "domain-bound" badge state | D |
| `packages/web/src/hooks/chat-engine/signals.ts` | `formatPkaStatus` domain-bound string | D |
| `packages/web/src/lib/security-helpers.ts` | `pkaVariant` domain-bound awareness | D |
| Reference/Tooling docs (6 files) | domain-binding sections/mentions | E |
| `.changeset/*.md` | aid / aid-engine / aid-doctor minor | E |

---

# PHASE A — Spec: make binding the default + trajectory

### Task A1: Reframe Appendix B.7 and §3.1/§3.2 from "optional" to "default"

**Files:**
- Modify: `packages/docs/specification.md`

- [ ] **Step 1: §3.1 — drop "optional"**

Find:
```markdown
Clients that need the endpoint's consent to the association use the optional domain-binding profile in Appendix B.7.
```
Replace with:
```markdown
Clients that need the endpoint's consent to the association use the domain-binding profile in Appendix B.7; v2 clients **SHOULD** request this by default.
```

- [ ] **Step 2: §3.2 — drop "optional", keep the caveat**

Find:
```markdown
- **Unauthorized association:** the optional domain-binding profile (Appendix B.7). This mitigation applies only when a client **requires** domain binding; merely requesting it does not stop an attacker-controlled endpoint from returning a valid unbound proof.
```
Replace with:
```markdown
- **Unauthorized association:** the domain-binding profile (Appendix B.7), which v2 clients SHOULD request by default. This mitigation applies only when a client **requires** domain binding; merely requesting it does not stop an attacker-controlled endpoint from returning a valid unbound proof.
```

- [ ] **Step 3: B.7 heading + opening — reframe**

First, drop "(Optional Profile)" from the heading. Find:
```markdown
### **B.7. Domain Binding (Optional Profile)**
```
Replace with:
```markdown
### **B.7. Domain Binding**
```

Then reframe the opening. Find:
```markdown
This optional profile lets an endpoint prove that it consents to serve as the agent for the queried domain, addressing the unauthorized-association gap described in Section 3.1 (What PKA Proves).
```
Replace with:
```markdown
This profile lets an endpoint prove that it consents to serve as the agent for the queried domain, addressing the unauthorized-association gap described in Section 3.1 (What PKA Proves). When `k` is present in an `aid2` record, clients **SHOULD** request domain binding by default (see Section 2.3). The domain-binding indicator in the discovery result is the expected outcome for well-configured v2 deployments; clients that need a hard enforcement boundary use `domain-binding=require` in enterprise policy (Section 3.3).
```

- [ ] **Step 4: B.7 — add Trajectory subsection before the closing `---`**

Find the closing of B.7 (the line `Domain binding is a statement by the endpoint that it serves the named domain. It does not prove authorization, delegation, or organizational identity.`) and immediately AFTER it (before the `---` that precedes Appendix C) insert:

```markdown

#### Trajectory

In AID v2, domain binding is optional-but-default: clients **SHOULD** send `AID-Domain`, and an unbound proof (`tag="aid-pka-v2"`) remains a valid outcome unless local policy requires binding (`domain-binding=require`, Section 3.3).

A future major version (`aid3`) is expected to make sending `AID-Domain` **REQUIRED** for clients performing PKA and to make rejecting unbound proofs the baseline. Establishing high adoption while the installed base is small is intended to minimize switching cost at that transition. Implementations that already send `AID-Domain` by default require no change at `aid3`.
```

- [ ] **Step 5: Regenerate manifest + verify**

Run: `pnpm docs:export && pnpm docs:verify`
Expected: exit 0; `export-manifest.json` + `.sha256` modified.

- [ ] **Step 6: Commit**

```bash
git add packages/docs/specification.md packages/docs/export-manifest.json packages/docs/export-manifest.sha256
git commit -m "docs(spec): reframe domain binding as default; add aid3 trajectory note"
```

### Task A2: §2.3 send-by-default step + §3.3 policy knob

**Files:**
- Modify: `packages/docs/specification.md`

- [ ] **Step 1: §2.3 — add a normative send-by-default step**

Find step 9 in the Client Discovery Algorithm:
```markdown
9. If `k` is present, perform PKA endpoint proof using Appendix B.
```
Replace with the two lines:
```markdown
9. If `k` is present, perform PKA endpoint proof using Appendix B. For `aid2` records, clients **SHOULD** request domain binding by sending the `AID-Domain` header (the A-label, lowercased, portless queried host from step 1) as described in Appendix B.7, unless local policy disables it (Section 3.3, `domain-binding=off`).
```

- [ ] **Step 2: §3.3 — add the knob to the list**

Find the policy-knob list:
```markdown
- **PKA policy:** `if-present | require`
- **DNSSEC policy:** `off | prefer | require`
- **Well-known policy:** `auto | disable`
- **Downgrade policy:** `off | warn | fail`
```
Replace with (append one line):
```markdown
- **PKA policy:** `if-present | require`
- **DNSSEC policy:** `off | prefer | require`
- **Well-known policy:** `auto | disable`
- **Downgrade policy:** `off | warn | fail`
- **Domain-binding policy:** `off | prefer | require`
```

- [ ] **Step 3: §3.3 — add the semantics**

Find the policy semantics block (after `downgrade=warn|fail` line):
```markdown
- `downgrade=warn|fail`: applies to PKA removal, key replacement, and `aid2` to `aid1` downgrade when previous state exists.
```
Add immediately after it:
```markdown
- `domain-binding=off`: the client does not send `AID-Domain` on PKA requests.
- `domain-binding=prefer` (default): the client sends `AID-Domain`. A domain-bound proof (`tag="aid-pka-v2-db"`) is recorded as such; an unbound proof (`tag="aid-pka-v2"`) is still accepted. `prefer` records the outcome but does not enforce it.
- `domain-binding=require`: when an endpoint proof is performed for a record containing `k`, discovery fails unless the proof is domain-bound (`tag="aid-pka-v2-db"`). This is the only mode that mitigates unauthorized association (Section 3.1, Appendix B.7); merely sending `AID-Domain` does not. Has no effect when no `k` is present or PKA yields no proof. `pka=require` and `domain-binding=require` compose: `pka=require` fails first when `k` is absent, then `domain-binding=require` enforces binding on the resulting proof.

When a record is discovered through the `.well-known` fallback (`trustSource=well-known-tls`, Appendix C), the queried host and the TLS-validated host are the same origin, so an `AID-Domain` binding there is largely redundant with TLS host validation. Clients still send `AID-Domain` and `domain-binding=require` still enforces, but the binding adds little beyond TLS in that path.
```

- [ ] **Step 4: Regenerate manifest + verify**

Run: `pnpm docs:export && pnpm docs:verify`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/docs/specification.md packages/docs/export-manifest.json packages/docs/export-manifest.sha256
git commit -m "docs(spec): add domain-binding policy knob (3.3) and send-by-default step (2.3)"
```

### Task A3: versioning.md baseline + trajectory

**Files:**
- Modify: `packages/docs/Reference/versioning.md`

- [ ] **Step 1: update the v2.0.0 bullet**

Find:
```markdown
- Optional PKA domain-binding profile (Appendix B.7): `AID-Domain` request header and `aid-pka-v2-db` tag let an endpoint consent to — or refuse — serving as the agent for the queried domain. Clients report `domainBound` on discovery results.
```
Replace with:
```markdown
- PKA domain-binding profile (Appendix B.7): `AID-Domain` request header and `aid-pka-v2-db` tag let an endpoint consent to — or refuse — serving as the agent for the queried domain. Clients **SHOULD** send `AID-Domain` by default (`domain-binding=prefer`) and report `domainBound` on discovery results. Hard enforcement uses `domain-binding=require` (Section 3.3). A future `aid3` is expected to make this mandatory; clients sending `AID-Domain` by default need no change at that transition.
```

- [ ] **Step 2: Regenerate manifest + verify**

Run: `pnpm docs:export && pnpm docs:verify`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/docs/Reference/versioning.md packages/docs/export-manifest.json packages/docs/export-manifest.sha256
git commit -m "docs(versioning): domain binding default + aid3 trajectory"
```

---

# PHASE B — TS SDK: the `domain-binding` policy knob

> Background facts (already on branch): `performPKAHandshake(uri, pka, kid?, domain?)` returns `PKAHandshakeResult { domainBound: boolean }` (exported from `packages/aid/src/pka.ts`). Discovery in `client.ts`/`browser.ts` calls a local `performPKAHandshakeForRecord(record, domain?)` and surfaces `DiscoveryResult.pka`. `discovery-security.ts` defines the existing policy types/enforcers and `DiscoverySecurity`. Read those before starting.

### Task B1: `DomainBindingPolicy` type + `enforceDomainBindingPolicy`

**Files:**
- Modify: `packages/aid/src/discovery-security.ts`
- Test: `packages/aid/src/discovery-security.v2.test.ts` (existing file with policy-enforcer tests)

- [ ] **Step 1: Write the failing tests**

Append to `packages/aid/src/discovery-security.v2.test.ts` (import `enforceDomainBindingPolicy`, `createDiscoverySecurity`, `resolveSecurityPolicy` from `./discovery-security.js`, and `AidError` from `./parser.js` — match the imports already at the top of that file; if a helper to build a `DiscoverySecurity` exists in the file, reuse it, otherwise build via `createDiscoverySecurity(resolveSecurityPolicy({ domainBindingPolicy: <mode> }), false)`):

```ts
describe('enforceDomainBindingPolicy', () => {
  const mk = (mode: 'off' | 'prefer' | 'require') =>
    createDiscoverySecurity(resolveSecurityPolicy({ domainBindingPolicy: mode }), false);

  it('off: does not throw and leaves bound null even on unbound proof', () => {
    const s = mk('off');
    enforceDomainBindingPolicy(s, 'example.com', { domainBound: false });
    expect(s.domainBinding.policy).toBe('off');
    expect(s.domainBinding.bound).toBeNull();
  });

  it('prefer: records bound=false on unbound proof, does not throw', () => {
    const s = mk('prefer');
    enforceDomainBindingPolicy(s, 'example.com', { domainBound: false });
    expect(s.domainBinding.bound).toBe(false);
  });

  it('prefer: records bound=true on bound proof', () => {
    const s = mk('prefer');
    enforceDomainBindingPolicy(s, 'example.com', { domainBound: true });
    expect(s.domainBinding.bound).toBe(true);
  });

  it('require: throws ERR_SECURITY on unbound proof', () => {
    const s = mk('require');
    expect(() => enforceDomainBindingPolicy(s, 'example.com', { domainBound: false })).toThrow(
      'Domain binding required',
    );
  });

  it('require: passes on bound proof', () => {
    const s = mk('require');
    expect(() => enforceDomainBindingPolicy(s, 'example.com', { domainBound: true })).not.toThrow();
  });

  it('no proof (undefined) is a no-op in all modes', () => {
    for (const mode of ['off', 'prefer', 'require'] as const) {
      const s = mk(mode);
      expect(() => enforceDomainBindingPolicy(s, 'example.com', undefined)).not.toThrow();
      expect(s.domainBinding.checked).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C packages/aid exec vitest run src/discovery-security.v2.test.ts -t "enforceDomainBindingPolicy"`
Expected: FAIL — `enforceDomainBindingPolicy` not exported, `domainBinding` missing on security, `domainBindingPolicy` not a known option.

- [ ] **Step 3: Add the type and option**

In `packages/aid/src/discovery-security.ts`, near the other policy type aliases (e.g. `PkaPolicy`):
```ts
export type DomainBindingPolicy = 'off' | 'prefer' | 'require';
```
Add `import type { PKAHandshakeResult } from './pka.js';` to the file's imports (this is a one-way import; `pka.ts` does not import `discovery-security.ts`).

In the options interface that holds `pkaPolicy?`/`dnssecPolicy?` (the input options type), add:
```ts
  domainBindingPolicy?: DomainBindingPolicy;
```

In the resolved-policy type that holds `pkaPolicy: ...`/`dnssecPolicy: ...`, add:
```ts
  domainBindingPolicy: DomainBindingPolicy;
```

- [ ] **Step 4: Wire defaults + presets in `resolveSecurityPolicy`**

IMPORTANT — `resolveSecurityPolicy` (discovery-security.ts ~82–144) has **two** return paths and **no single `mode` variable**: (a) a no-`securityMode` branch that spreads `defaultPolicy`, and (b) a preset branch using an inline `preset` object with `preset.mode`. Add the field to **both** returns; do NOT reference a bare `mode`.

- In the no-`securityMode` return object add:
```ts
    domainBindingPolicy: options.domainBindingPolicy ?? 'prefer',
```
- In the preset-branch return object add:
```ts
    domainBindingPolicy:
      options.domainBindingPolicy ?? (preset.mode === 'strict' ? 'require' : 'prefer'),
```
(So default and `balanced` → `'prefer'`; `strict` → `'require'`; explicit option always wins.) If the function tracks an `overrideUsed`/`mode='custom'` flag for explicit overrides, set it when `options.domainBindingPolicy !== undefined` too, mirroring the other knobs.

Note the field must be added in **both** option interfaces: the standalone `SecurityPolicyOptions` (the exported input type, ~line 35) **and** the inline param type on `resolveSecurityPolicy` if it has its own — plus `ResolvedSecurityPolicy` (~line 73). Making it required on `ResolvedSecurityPolicy` is safe (only `resolveSecurityPolicy` constructs it).

- [ ] **Step 5: Add the `domainBinding` block in `createDiscoverySecurity`**

In the `DiscoverySecurity` result interface, after the `pka` block, add:
```ts
  domainBinding: {
    policy: DomainBindingPolicy;
    checked: boolean;
    bound: boolean | null;
  };
```
In `createDiscoverySecurity`, in the returned object, add:
```ts
    domainBinding: {
      policy: policy.domainBindingPolicy,
      checked: false,
      bound: null,
    },
```

- [ ] **Step 6: Implement `enforceDomainBindingPolicy`**

Add (near `enforceDnssecPolicy`):
```ts
export function enforceDomainBindingPolicy(
  security: DiscoverySecurity,
  queryName: string,
  pkaResult: PKAHandshakeResult | undefined,
): void {
  if (pkaResult === undefined) return; // no key / no proof — nothing to evaluate
  security.domainBinding.checked = true;
  if (security.domainBinding.policy === 'off') {
    security.domainBinding.bound = null; // binding not requested
    return;
  }
  security.domainBinding.bound = pkaResult.domainBound;
  if (security.domainBinding.policy === 'require' && !pkaResult.domainBound) {
    throw new AidError('ERR_SECURITY', `Domain binding required but not attested for ${queryName}`);
  }
}
```

- [ ] **Step 7: Run to verify pass**

Run: `pnpm -C packages/aid exec vitest run src/discovery-security.v2.test.ts -t "enforceDomainBindingPolicy"`
Expected: PASS (6 cases).

- [ ] **Step 8: Run the full aid suite + typecheck**

Run: `pnpm -C packages/aid test && pnpm -C packages/aid build`
Expected: green. (Existing `DiscoverySecurity` consumers gain a new field — additive, no breakage.)

- [ ] **Step 9: Commit**

```bash
git add packages/aid/src/discovery-security.ts packages/aid/src/discovery-security.v2.test.ts
git commit -m "feat(aid): add domain-binding policy (off|prefer|require) and enforcer"
```

### Task B2: Wire conditional send + enforcement into `client.ts` (Node)

**Files:**
- Modify: `packages/aid/src/client.ts`
- Test: `packages/aid/src/client.pka.domain.integration.test.ts` (existing)

- [ ] **Step 1: Write the failing integration test**

Append to `packages/aid/src/client.pka.domain.integration.test.ts` a test that drives `discover()` with `domainBindingPolicy: 'require'` against a server returning a plain `aid-pka-v2` (unbound) proof, expecting `ERR_SECURITY`. Reuse the file's existing `b64url`/`jwkThumbprint` helpers and the `g`/`origFetch` setup:

```ts
  it('require policy fails when the endpoint returns an unbound proof', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const x = b64url(rawPub);
    const keyid = await jwkThumbprint(x);

    g.fetch = vi.fn(async (url: string) => {
      if (url.includes('/.well-known/agent')) {
        return {
          ok: true,
          status: 200,
          headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
          text: async () => JSON.stringify({ v: 'aid2', u: 'https://api.example.com/mcp', p: 'mcp', k: x }),
        };
      }
      // Plain v2 (unbound) proof: 4 covered components, tag aid-pka-v2.
      const created = Math.floor(Date.now() / 1000);
      const expires = created + 60;
      // Read the nonce the client sent so the signature verifies.
      const accept = (g.fetch as any).mock.calls.at(-1)?.[1]?.headers?.['Accept-Signature'] ?? '';
      const nonce = /nonce="([^"]+)"/.exec(accept)?.[1] ?? '';
      const params = `("@method";req "@target-uri";req "@authority";req "@status");created=${created};expires=${expires};keyid="${keyid}";alg="ed25519";nonce="${nonce}";tag="aid-pka-v2"`;
      const base = [
        `"@method";req: GET`,
        `"@target-uri";req: https://api.example.com/mcp`,
        `"@authority";req: api.example.com`,
        `"@status": 200`,
        `"@signature-params": ${params}`,
      ].join('\n');
      const sig = new Uint8Array(await nodeWebcrypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(base)));
      return {
        ok: true, status: 200,
        headers: { get: (name: string) => {
          const k = name.toLowerCase();
          if (k === 'signature-input') return `aid-pka=${params}`;
          if (k === 'signature') return `aid-pka=:${Buffer.from(sig).toString('base64')}:`;
          if (k === 'cache-control') return 'no-store';
          return null;
        } },
        text: async () => '',
      };
    });

    await expect(
      discover('example.com', { wellKnownFallback: true, domainBindingPolicy: 'require' }),
    ).rejects.toMatchObject({ errorCode: 'ERR_SECURITY' });
  });
```

Also add an `off`-suppression test (proves a core design promise — `off` must NOT send `AID-Domain`). This reuses the existing test's mock shape but captures the header. Add it as a second `it(...)`:

```ts
  it('off policy does not send the AID-Domain header', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const x = b64url(rawPub);
    const keyid = await jwkThumbprint(x);
    let sawAidDomain: string | undefined = 'UNSET';

    g.fetch = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (url.includes('/.well-known/agent')) {
        return {
          ok: true, status: 200,
          headers: { get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null) },
          text: async () => JSON.stringify({ v: 'aid2', u: 'https://api.example.com/mcp', p: 'mcp', k: x }),
        };
      }
      sawAidDomain = init?.headers?.['AID-Domain'];
      const created = Math.floor(Date.now() / 1000);
      const expires = created + 60;
      const accept = init?.headers?.['Accept-Signature'] ?? '';
      const nonce = /nonce="([^"]+)"/.exec(accept)?.[1] ?? '';
      const params = `("@method";req "@target-uri";req "@authority";req "@status");created=${created};expires=${expires};keyid="${keyid}";alg="ed25519";nonce="${nonce}";tag="aid-pka-v2"`;
      const base = [
        `"@method";req: GET`,
        `"@target-uri";req: https://api.example.com/mcp`,
        `"@authority";req: api.example.com`,
        `"@status": 200`,
        `"@signature-params": ${params}`,
      ].join('\n');
      const sig = new Uint8Array(await nodeWebcrypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(base)));
      return {
        ok: true, status: 200,
        headers: { get: (name: string) => {
          const k = name.toLowerCase();
          if (k === 'signature-input') return `aid-pka=${params}`;
          if (k === 'signature') return `aid-pka=:${Buffer.from(sig).toString('base64')}:`;
          if (k === 'cache-control') return 'no-store';
          return null;
        } },
        text: async () => '',
      };
    });

    await discover('example.com', { wellKnownFallback: true, domainBindingPolicy: 'off' });
    expect(sawAidDomain).toBeUndefined();
  });
```

(Composition `pka=require` + `domain-binding=require` is covered transitively: `pka=require` with no `k` throws first; with `k` present the unbound case above exercises the binding failure. Optionally add a `{ pkaPolicy: 'require', domainBindingPolicy: 'require' }` variant of the require test for explicitness.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C packages/aid exec vitest run src/client.pka.domain.integration.test.ts -t "require policy"`
Expected: FAIL — `domainBindingPolicy` is not an accepted option and no enforcement runs, so discovery resolves instead of throwing.

- [ ] **Step 3: Add the option + imports**

In `client.ts` imports from `./discovery-security.js`, add `type DomainBindingPolicy` and `enforceDomainBindingPolicy`.
In the `DiscoveryOptions` interface, after `downgradePolicy?`:
```ts
  /** Domain-binding enforcement for v2 PKA proofs. */
  domainBindingPolicy?: DomainBindingPolicy;
```

- [ ] **Step 4: Conditional send + enforcement (DNS path)**

In `queryOnce`, the success block currently reads (around the selected record):
```ts
        const result = selectedRecords[0];
        const pkaResult = await performPKAHandshakeForRecord(result.record, normalizeDomain(domain));
        const security = createDiscoverySecurity(policy, false);
        enforcePkaPolicy(result.record, queryName, security);
        await enforceDowngradePolicy(result.record, queryName, policy, security);
```
Change the handshake line to suppress the domain when policy is `off`, and add the enforcement after `enforceDowngradePolicy`:
```ts
        const result = selectedRecords[0];
        const bindingDomain =
          policy.domainBindingPolicy === 'off' ? undefined : normalizeDomain(domain);
        const pkaResult = await performPKAHandshakeForRecord(result.record, bindingDomain);
        const security = createDiscoverySecurity(policy, false);
        enforcePkaPolicy(result.record, queryName, security);
        await enforceDowngradePolicy(result.record, queryName, policy, security);
        enforceDomainBindingPolicy(security, queryName, pkaResult);
```
(`policy` is `resolveSecurityPolicy(options)` from the enclosing `discover` scope.)

- [ ] **Step 5: Conditional send + enforcement (well-known path)**

In `fetchWellKnown`, where it currently does `pkaResult = await performPKAHandshakeForRecord(record, normalizeDomain(domain));` followed by `enforcePkaPolicy` / `enforceDowngradePolicy`, change to:
```ts
      const bindingDomain =
        policy.domainBindingPolicy === 'off' ? undefined : normalizeDomain(domain);
      pkaResult = await performPKAHandshakeForRecord(record, bindingDomain);
```
and after the `enforceDowngradePolicy(record, url, policy, security);` line add:
```ts
    enforceDomainBindingPolicy(security, url, pkaResult);
```
(`policy` is computed at the top of `fetchWellKnown` via `resolveSecurityPolicy(options)`; `pkaResult` is the `let pkaResult` already declared in this function.)

- [ ] **Step 6: Run the new test + full suite**

Run: `pnpm -C packages/aid exec vitest run src/client.pka.domain.integration.test.ts && pnpm -C packages/aid test`
Expected: the new "require policy" test PASSES; full suite green.

- [ ] **Step 7: Commit**

```bash
git add packages/aid/src/client.ts packages/aid/src/client.pka.domain.integration.test.ts
git commit -m "feat(aid): enforce domain-binding policy in Node discovery (conditional send + require)"
```

### Task B3: Mirror in `browser.ts`

**Files:**
- Modify: `packages/aid/src/browser.ts`
- Test: `packages/aid/src/client.browser.test.ts` (the real browser discovery test file — there is NO `browser*.test.ts`; confirm with `ls packages/aid/src/*browser*.test.ts`)

- [ ] **Step 1: Write the failing test**

Add a browser-path test mirroring B2's, driving the browser `discover()` with `domainBindingPolicy: 'require'` against an unbound-proof mock and expecting `ERR_SECURITY`. Browser discovery uses DoH; mock `fetch` for both the DoH TXT query (return NXDOMAIN/empty so it falls to well-known) and the well-known + handshake, mirroring the existing browser test setup in the file. If the existing browser test file already has a fetch-mock harness, reuse it; assert `discover('example.com', { domainBindingPolicy: 'require', wellKnownFallback: true })` rejects with `errorCode: 'ERR_SECURITY'`.

(If no browser integration test harness exists, add the assertion to the closest existing browser discovery test using its established mock pattern; the key is exercising the `require` enforcement in `browser.ts`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C packages/aid exec vitest run src/client.browser.test.ts -t "require"`
Expected: FAIL (option not accepted / no enforcement).

- [ ] **Step 3: Add the option + imports**

In `browser.ts` imports from `./discovery-security.js`, add `type DomainBindingPolicy` and `enforceDomainBindingPolicy`. In the browser `DiscoveryOptions` interface, after `downgradePolicy?`:
```ts
  domainBindingPolicy?: DomainBindingPolicy;
```

- [ ] **Step 4: Conditional send + enforcement (DNS path)**

In the browser DNS success block, change:
```ts
      const result = selectedRecords[0];
      const pkaResult = await performPKAHandshakeForRecord(result.record, normalizeDomain(domain));
```
to:
```ts
      const result = selectedRecords[0];
      const bindingDomain =
        policy.domainBindingPolicy === 'off' ? undefined : normalizeDomain(domain);
      const pkaResult = await performPKAHandshakeForRecord(result.record, bindingDomain);
```
and after the `enforceDowngradePolicy(result.record, name, policy, security);` line add:
```ts
      enforceDomainBindingPolicy(security, name, pkaResult);
```
(`name` is the query-name variable used in the browser DNS path; `policy` is in scope.)

- [ ] **Step 5: Conditional send + enforcement (well-known path)**

In browser `fetchWellKnown`, change the handshake call to use `bindingDomain` (same `policy.domainBindingPolicy === 'off' ? undefined : normalizeDomain(domain)` pattern) and add `enforceDomainBindingPolicy(security, url, pkaResult);` after `enforceDowngradePolicy(...)`.

- [ ] **Step 6: Run tests + build**

Run: `pnpm -C packages/aid test && pnpm -C packages/aid build`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add packages/aid/src/browser.ts packages/aid/src/client.browser.test.ts
git commit -m "feat(aid): enforce domain-binding policy in browser discovery"
```

---

# PHASE C — TS tooling: aid-engine report + aid-doctor output/cache/CLI

### Task C1: Capture `domainBound` in the engine report

**Files:**
- Modify: `packages/aid-engine/src/types.ts`
- Modify: `packages/aid-engine/src/checker.ts`
- Test: `packages/aid-engine/src/checker.test.ts` (confirm filename via `ls packages/aid-engine/src/*.test.ts`)

- [ ] **Step 1: Write/adjust the failing test**

In `checker.test.ts`, the existing `vi.mock('@agentcommunity/aid', ...)` mocks `performPKAHandshake` with an inline `vi.fn().mockResolvedValue(undefined)` and exposes **no variable**. Two required changes:

(a) Change the default mock resolution from `undefined` to `{ domainBound: false }` — otherwise the new `pkaResult.domainBound` read throws for the existing v2 PKA cases (the ones with a `pka` value). (b) Get a typed handle to drive per-test values: add at the top of the test file `import { performPKAHandshake } from '@agentcommunity/aid';` and, inside the describe (or beforeEach), `const mockedPerformPKAHandshake = vi.mocked(performPKAHandshake);`.

Then add the test:
```ts
  it('records domainBound from the v2 handshake result', async () => {
    mockedPerformPKAHandshake.mockResolvedValueOnce({ domainBound: true });
    const report = await runCheck('example.com', /* opts as used elsewhere in the file */);
    expect(report.pka.domainBound).toBe(true);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C packages/aid-engine exec vitest run src/checker.test.ts -t "domainBound"`
Expected: FAIL — `report.pka.domainBound` is undefined (not captured).

- [ ] **Step 3: Add the field to the report type**

In `packages/aid-engine/src/types.ts`, in the `PkaBlock` interface (the one with `verified: boolean | null`), add:
```ts
  domainBound?: boolean | null;
```

- [ ] **Step 4: Capture it in `checker.ts`**

In `runCheck`, the v2 branch currently:
```ts
          // Sends AID-Domain so the endpoint can prove/refuse the binding; the domainBound
          // result is verified but not yet surfaced in the doctor report (deferred follow-up).
          await performPKAHandshake(record.uri, record.pka, undefined, normalizeDomainHost(domain));
```
Replace with:
```ts
          const pkaResult = await performPKAHandshake(
            record.uri,
            record.pka,
            undefined,
            normalizeDomainHost(domain),
          );
          report.pka.domainBound = pkaResult.domainBound;
```
For the v1 branch, after its `await performPKAHandshake(record.uri, record.pka, record.kid ?? '')`, add:
```ts
          report.pka.domainBound = false; // v1 never domain-binds
```
In `initReport` (or wherever the initial `pka` block is built), add `domainBound: null` to the initial pka shape.

- [ ] **Step 5: Run test + engine suite**

Run: `pnpm -C packages/aid-engine test`
Expected: green (including the new assertion).

- [ ] **Step 6: Commit**

```bash
git add packages/aid-engine/src/types.ts packages/aid-engine/src/checker.ts packages/aid-engine/src/checker.test.ts
git commit -m "feat(aid-engine): capture pka domainBound into the doctor report"
```

### Task C2: aid-doctor cache schema v2→v3 + binding-loss classification

**Files:**
- Modify: `packages/aid-engine/src/types.ts` (`CacheEntry`, `DowngradeBlock.status`)
- Modify: `packages/aid-doctor/src/cache.ts`
- Test: `packages/aid-doctor/src/cache.test.ts`

- [ ] **Step 0: Read the real migration shape first (prevents a data-loss bug)**

Before writing tests, READ `migrateCacheFile`/`migrateEntry` in `cache.ts` and the existing cache-test fixtures to learn the exact on-disk shape (wrapped `{ schemaVersion, entries: {...} }` vs flat `{ key: entry }`) and how `migrateCacheFile` walks it. **Critical:** when you bump `CACHE_SCHEMA_VERSION` to `3`, a stored v2 file no longer short-circuits the version-equality guard and falls into the migration walk. Confirm that walk actually descends into `entries` and re-maps each one through `migrateEntry`. If it iterates the top-level object and `continue`s past `schemaVersion`/`entries` keys without descending, bumping the constant would **drop every entry** (silent data loss). If so, fix `migrateCacheFile` to map over `raw.entries` for any version mismatch. Use the fixture shape the real loader consumes.

- [ ] **Step 1: Write the failing tests**

Add to `cache.test.ts` (use the fixture shape confirmed in Step 0; the example below assumes the wrapped shape — adjust to reality):
```ts
  it('migrates a v2 cache file to v3 without dropping entries, backfilling domainBound:null', () => {
    const legacy = { schemaVersion: 2, entries: { 'example.com|mcp': { lastSeen: '2026-06-01', pka: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ', kid: null } } };
    const migrated = migrateCacheFile(legacy as any);
    expect(migrated.schemaVersion).toBe(3);
    const entries = Object.values(migrated.entries);
    expect(entries).toHaveLength(1); // entry survived migration — guards against the data-loss path
    expect(entries[0].domainBound ?? null).toBeNull();
  });

  it('classifies a binding loss when key/version are unchanged', () => {
    // Same pka/keyid/jwkX/trustSource/version on both sides so key_replaced/version_downgrade
    // do NOT fire — only domainBound differs.
    const base = { pka: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ', keyid: 'WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk', jwkX: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ', version: 'aid2', trustSource: 'dns' };
    const prev = { ...base, domainBound: true } as any;
    const cur = { ...base, domainBound: false } as any;
    expect(classifySecurityChange(prev, cur)).toBe('binding_loss');
  });

  it('prefers key_replaced over binding_loss when both change', () => {
    const prev = { pka: 'AAAA', keyid: 'A', jwkX: 'AAAA', version: 'aid2', trustSource: 'dns', domainBound: true } as any;
    const cur = { pka: 'BBBB', keyid: 'B', jwkX: 'BBBB', version: 'aid2', trustSource: 'dns', domainBound: false } as any;
    expect(classifySecurityChange(prev, cur)).toBe('key_replaced'); // higher-severity, fail-eligible status wins
  });
```
(Match the actual exported names/shapes in `cache.ts`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C packages/aid-doctor exec vitest run src/cache.test.ts -t "binding|v3"`
Expected: FAIL — schema is 2, no `domainBound`, no `binding_loss`.

- [ ] **Step 3: Bump schema + add field + status**

In `packages/aid-doctor/src/cache.ts`:
- Change `const CACHE_SCHEMA_VERSION = 2;` → `= 3;`.
- In `CacheEntry`, add `domainBound?: boolean | null;`.
- In the `SecurityChangeStatus` union, add `'binding_loss'`.

In `packages/aid-engine/src/types.ts`, add `'binding_loss'` to the `DowngradeBlock.status` union (so the report type matches).

- [ ] **Step 4: Backfill in `migrateEntry`; set in `buildCacheEntryFromReport`; classify**

In `migrateEntry`, add `domainBound: entry.domainBound ?? null,` to the returned object. Ensure `migrateCacheFile` descends into `entries` for any `schemaVersion !== CACHE_SCHEMA_VERSION` (the Step 0 data-loss check) — if it doesn't today, make it map over `raw.entries`.
In `buildCacheEntryFromReport`, add `domainBound: report.pka.domainBound ?? null,`.
In `classifySecurityChange`, place the binding-loss branch **AFTER** the higher-severity, fail-eligible branches (`key_replaced`, `version_downgrade`) and after `pka_removed`, so a simultaneous key-rotation-and-binding-drop still classifies as `key_replaced` (which `downgrade=fail` rejects) rather than the warning-only `binding_loss`. Insert it just before the final "no change" return:
```ts
  if (previous.domainBound === true && current.domainBound === false) {
    return 'binding_loss';
  }
```
(Security note: ordering matters — `binding_loss` is warning-only; if it short-circuited before `key_replaced` it would mask a hard-fail and create a downgrade-evasion path.)

- [ ] **Step 5: Run cache suite**

Run: `pnpm -C packages/aid-doctor exec vitest run src/cache.test.ts`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/aid-engine/src/types.ts packages/aid-doctor/src/cache.ts packages/aid-doctor/src/cache.test.ts
git commit -m "feat(aid-doctor): cache schema v3 with domainBound and binding-loss classification"
```

### Task C3: aid-doctor binding-loss warning mapping

**Files:**
- Modify: `packages/aid-doctor/src/security-state.ts`
- Test: `packages/aid-doctor/src/security-state.test.ts`

- [ ] **Step 1: Write the failing test**

NOTE: `warningByStatus` is a function-local inside `applySecurityState`, and `FAIL_POLICY_STATUSES` is a module-local `const` — **neither is exported**, so do not import them. Test the observable behavior of `applySecurityState` instead. First read `security-state.test.ts` for the existing status-transition test pattern (how it builds a report with a downgrade status and calls `applySecurityState`), then add a test asserting: a `binding_loss` transition pushes a `BINDING_LOSS` warning onto the report's warnings, and does NOT set a failing exit code even under `downgrade=fail`. Shape it like the existing tests, e.g.:
```ts
  it('warns on binding_loss without failing, even under downgrade=fail', () => {
    const report = makeReportWithDowngradeStatus('binding_loss'); // build per the file's existing helper/pattern
    applySecurityState(report, { downgradePolicy: 'fail' });      // match the real call signature
    expect(report.record.warnings.some((w) => w.code === 'BINDING_LOSS')).toBe(true);
    expect(report.exitCode).not.toBe(1003); // not a hard fail
  });
```
(Adapt the helper name, call signature, and warning location to what the file actually uses.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C packages/aid-doctor exec vitest run src/security-state.test.ts -t "binding_loss"`
Expected: FAIL.

- [ ] **Step 3: Add the mapping**

In `security-state.ts`, in the `warningByStatus` map add:
```ts
  binding_loss: {
    code: 'BINDING_LOSS',
    message:
      'Domain-binding proof was present in the previous check but is now absent (endpoint-proof only).',
  },
```
Do NOT add `binding_loss` to `FAIL_POLICY_STATUSES` (warning-only during rollout).

- [ ] **Step 4: Run suite**

Run: `pnpm -C packages/aid-doctor exec vitest run src/security-state.test.ts`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/aid-doctor/src/security-state.ts packages/aid-doctor/src/security-state.test.ts
git commit -m "feat(aid-doctor): warn on domain-binding loss"
```

### Task C4: aid-doctor output indicator + JSON field

**Files:**
- Modify: `packages/aid-doctor/src/output.ts`
- Test: `packages/aid-doctor/src/cli.test.ts` (or the output test file — confirm via `ls packages/aid-doctor/src/*.test.ts`)

- [ ] **Step 1: Write the failing tests**

The human-render function is `formatCheckResult(report)` (exported from `output.ts`), NOT `renderHuman`. The output tests build a full `DoctorReport` (the `makeReport()` helper lives in the CLI-action describe block; in the output describe block tests construct report literals inline). Use `formatCheckResult` and a full report value. Add:
```ts
  it('shows "domain-bound" when domainBound is true', () => {
    const out = formatCheckResult({ ...makeReport(), pka: { ...makeReport().pka, present: true, verified: true, domainBound: true } });
    expect(out).toContain('domain-bound');
  });
  it('shows "endpoint-proof only" when domainBound is false', () => {
    const out = formatCheckResult({ ...makeReport(), pka: { ...makeReport().pka, present: true, verified: true, domainBound: false } });
    expect(out).toContain('endpoint-proof only');
  });
```
(If the output describe block has no `makeReport`, build a full `DoctorReport` literal with `pka.domainBound` set, matching the inline-literal style already used there.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C packages/aid-doctor exec vitest run -t "domain-bound|endpoint-proof"`
Expected: FAIL.

- [ ] **Step 3: Render the indicator**

In `output.ts`, in the PKA Handshake (`[5/6]`) verified branch, compute and append a binding label:
```ts
  const bindingLabel =
    pka.domainBound === true
      ? ', domain-bound'
      : pka.domainBound === false
        ? ', endpoint-proof only'
        : '';
```
and include `${bindingLabel}` in the verified line. In `generateActionableSuggestions`, add: if `pka.present && pka.verified && pka.domainBound === false`, suggest enabling domain binding on the endpoint. (JSON output needs no change — `report.pka.domainBound` serializes automatically once present on the type.)

- [ ] **Step 4: Run suite**

Run: `pnpm -C packages/aid-doctor test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/aid-doctor/src/output.ts packages/aid-doctor/src/cli.test.ts
git commit -m "feat(aid-doctor): show domain-bound vs endpoint-proof in output"
```

### Task C5: aid-doctor `--domain-binding` flag

**Files:**
- Modify: `packages/aid-doctor/src/cli.ts`
- Modify: `packages/aid-engine/src/checker.ts` (thread `domainBindingPolicy` into the SDK `discover`/handshake path used by `runCheck`, if `runCheck` calls the SDK with options; otherwise the engine performs the handshake directly and the policy must be honored there — see note)
- Test: `packages/aid-doctor/src/cli.test.ts`

> Note: `runCheck` performs the PKA handshake directly (not via the SDK `discover`), so the `domain-binding` enforcement for aid-doctor is applied in `runCheck` using the captured `pkaResult.domainBound`. Enforcement must happen **at the point the handshake result is captured**, before the report feeds `applySecurityState`/cache-write — otherwise a rejected record could be persisted as verified. Concretely, in the v2 branch right after `report.pka.domainBound = pkaResult.domainBound;`: when `domainBindingPolicy === 'require' && pkaResult.domainBound === false`, set `report.pka.verified = false`, push a PKA error/suggestion, and set the report's failing exit code (the same `1003`/`ERR_SECURITY` exit path the PKA-verification-failure branch already uses — reuse it, don't invent a new code). When `domainBindingPolicy === 'off'`, call the v2 handshake with `undefined` domain (suppress `AID-Domain`). `prefer` is unchanged (record only).

- [ ] **Step 1: Write the failing test**

Add a CLI test asserting `--domain-binding require` is parsed into `CheckOptions` and that a report with `pka.domainBound === false` under `require` produces a non-zero/failed result. Mirror the file's existing flag-parsing test pattern; if direct CLI invocation is hard to unit-test, assert the option mapping function maps `--domain-binding require` → `{ domainBindingPolicy: 'require' }`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C packages/aid-doctor exec vitest run src/cli.test.ts -t "domain-binding"`
Expected: FAIL (flag unknown).

- [ ] **Step 3: Add the flag + thread the option**

In `cli.ts`, add the flag to **both** the `check` command AND the `json` command (each is defined separately):
```ts
  .option('--domain-binding <policy>', 'Domain binding policy: off | prefer | require', 'prefer')
```
Both commands have their own **inline** `options: {...}` type literal — add `domainBinding?: 'off' | 'prefer' | 'require'` to BOTH (otherwise TS errors on `options.domainBinding`), and map it into `CheckOptions` for both. Add `domainBindingPolicy?: 'off' | 'prefer' | 'require'` to `CheckOptions` in the engine types (`types.ts`). In `checker.ts`, apply the enforcement exactly as described in the Note above (suppress `AID-Domain` on `off`; on `require` + unbound, fail the PKA step + set the existing failing exit code, at the capture point before cache-write).

- [ ] **Step 4: Run suites + build**

Run: `pnpm -C packages/aid-doctor test && pnpm -C packages/aid-engine test && pnpm -C packages/aid-doctor build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/aid-doctor/src/cli.ts packages/aid-engine/src/checker.ts packages/aid-engine/src/types.ts packages/aid-doctor/src/cli.test.ts
git commit -m "feat(aid-doctor): --domain-binding flag (off|prefer|require)"
```

---

# PHASE D — Web workbench surfacing

### Task D1: Thread `domainBound` through the discovery hook

**Files:**
- Modify: `packages/web/src/hooks/use-discovery.ts`
- Modify: `packages/web/src/lib/datasources/live-datasource.ts`
- Test: `packages/web/src/tests/use-discovery.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `packages/web/src/tests/use-discovery.test.ts` mocking the SDK `discover` to resolve a result with `pka: { domainBound: true }`, render/execute the hook, and assert `metadata.pka.domainBound === true`. Match the web test setup (vitest + the project's React testing util). If hook unit-testing is awkward, test the pure mapping function that builds `metadata.pka` from `libResult` instead (extract it if needed).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C packages/web exec vitest run src/tests/use-discovery.test.ts`
Expected: FAIL — `domainBound` not in metadata.

- [ ] **Step 3: Add the field + mapping**

In `use-discovery.ts`, extend the `DiscoveryMetadata.pka` type:
```ts
pka?: { present: boolean; verified: boolean | null; keyid: string | null; domainBound?: boolean };
```
IMPORTANT (coherence): today `metadata.pka` is built from `parsed.pka` (DNS-record presence) with `verified: null` — so a "verified" badge never fires and a stray `domainBound: true` next to `verified: null` would be incoherent. Since the SDK's `discover()` throws on PKA failure, a present `libResult.pka` means the proof verified. So derive both from `libResult.pka`:
```ts
  verified: libResult.pka ? true : null,
  domainBound: libResult.pka?.domainBound,
```
In `live-datasource.ts`, `metadata` currently has **no** `pka` key at all and no keyid derivation — build the full object from scratch:
```ts
  pka: {
    present: Boolean(parsed.pka),
    verified: libResult.pka ? true : null,
    keyid: null, // keyid derivation not available in this datasource; null is acceptable
    domainBound: libResult.pka?.domainBound,
  },
```

- [ ] **Step 4: Run test + web suite**

Run: `pnpm -C packages/web exec vitest run src/tests/use-discovery.test.ts && pnpm -C packages/web test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/use-discovery.ts packages/web/src/lib/datasources/live-datasource.ts packages/web/src/tests/use-discovery.test.ts
git commit -m "feat(web): thread pka.domainBound through the discovery hook"
```

### Task D2: Domain-bound badge + status string

**Files:**
- Modify: `packages/web/src/components/workbench/blocks/discovery-block.tsx`
- Modify: `packages/web/src/hooks/chat-engine/signals.ts`
- Modify: `packages/web/src/lib/security-helpers.ts`
- Test: `packages/web/src/tests/security-helpers.test.ts`, `packages/web/src/tests/chat-engine-signals.test.ts`

- [ ] **Step 1: Write the failing tests**

In `security-helpers.test.ts`, after extending `pkaVariant` to accept `domainBound`, add a case asserting a domain-bound proof still returns `'success'`. NOTE: `formatPkaStatus` is **module-local** (not exported) in `signals.ts`, so don't import it. In `chat-engine-signals.test.ts`, test through the EXPORTED signal builder the file already uses (e.g. `buildDiscoveryResultSignal`/`buildHandshakeSignal`): construct an input with `pka: { present: true, verified: true, domainBound: true }`, call the builder, and assert the emitted PKA detail string contains `'Domain-bound'`. (Either keep `formatPkaStatus` module-local and test via the builder, or export it — testing via the builder is preferred since it exercises real output.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C packages/web exec vitest run src/tests/security-helpers.test.ts src/tests/chat-engine-signals.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `security-helpers.ts`, add an optional `domainBound?: boolean` param to `pkaVariant` (return `'success'` for verified, bound or not). In `signals.ts`, update `formatPkaStatus` to return `'Domain-bound'` when `domainBound === true` (else existing `'Verified'`), and add `domainBound?: boolean` to its param type and the discovery+handshake signal builders. In `discovery-block.tsx`, in the PKA badge branch where `verified === true`, render the label `'PKA domain-bound'` when `metadata.pka.domainBound === true` else `'PKA verified'`.

- [ ] **Step 4: Run web suite + build**

Run: `pnpm -C packages/web test && pnpm -C packages/web build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/workbench/blocks/discovery-block.tsx packages/web/src/hooks/chat-engine/signals.ts packages/web/src/lib/security-helpers.ts packages/web/src/tests/security-helpers.test.ts packages/web/src/tests/chat-engine-signals.test.ts
git commit -m "feat(web): surface domain-bound proof in workbench discovery UI"
```

### Task D3: Handshake/connection path surfacing

**Files:**
- Modify: `packages/web/src/app/api/handshake/route.ts`
- Modify: `packages/web/src/hooks/use-connection.ts`
- Modify: `packages/web/src/components/workbench/blocks/connection-block.tsx`
- Test: extend the relevant web test

> Depends on Task C1 (engine now exposes `report.pka.domainBound`).

- [ ] **Step 1: Write the failing test**

Add a test that the handshake route's `getSecurityInfo` includes `domainBound` from `report.pka.domainBound`, and that `connection-block.tsx` shows the domain-bound label when true. Mirror the existing handshake-route/connection tests.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm -C packages/web exec vitest run -t "handshake|connection"`
Expected: FAIL — `domainBound` not surfaced.

- [ ] **Step 3: Implement**

In `handshake/route.ts` `getSecurityInfo`, add `domainBound: report.pka.domainBound ?? null` to the returned `pka` object. In `use-connection.ts`, add `domainBound?: boolean | null` to `HandshakeSuccessData.security.pka`. In `connection-block.tsx`, add the same domain-bound badge branch as discovery-block.

- [ ] **Step 4: Run web suite + build**

Run: `pnpm -C packages/web test && pnpm -C packages/web build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/app/api/handshake/route.ts packages/web/src/hooks/use-connection.ts packages/web/src/components/workbench/blocks/connection-block.tsx packages/web/src/tests
git commit -m "feat(web): surface domain-bound proof in workbench connection UI"
```

---

# PHASE E — Reference docs sweep + changeset + verification

### Task E1: Reference & Tooling docs

**Files:**
- Modify: `packages/docs/Reference/identity_pka.md`, `pka.md`, `security.md`, `enterprise_rollout.md`, `discovery_api.md`, `troubleshooting.md`, `packages/docs/Tooling/aid_doctor.md`

- [ ] **Step 1: Apply the per-doc edits**

| File | Edit |
| --- | --- |
| `identity_pka.md` | New "Domain Binding" subsection: v2 clients SHOULD send `AID-Domain`; `domainBound` meaning; `domain-binding=require` lever. |
| `pka.md` | New "Domain Binding Profile" section: `AID-Domain` header, `aid-pka-v2-db` tag, `"aid-domain";req` component, verifier rules 1–2 from B.7, `domainBound`. |
| `security.md` | Defense-in-depth row "Domain Binding — optional-but-default — unauthorized association"; best-practices bullet. |
| `enterprise_rollout.md` | `balanced` preset adds `domain-binding: prefer`; `strict` adds `domain-binding: require`; checklist item. |
| `discovery_api.md` | Document `domainBindingPolicy?: 'off' \| 'prefer' \| 'require'` option; note clients send `AID-Domain` by default and report `domainBound`. |
| `troubleshooting.md` | PKA-failure checklist: `domain-binding=require` causing `ERR_SECURITY` on unbound/403. |
| `aid_doctor.md` | `--domain-binding` flag; `domainBound` in output + JSON; `BINDING_LOSS` warning. |

- [ ] **Step 2: Regenerate manifest + verify**

Run: `pnpm docs:export && pnpm docs:verify`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/docs/Reference/*.md packages/docs/Tooling/aid_doctor.md packages/docs/export-manifest.json packages/docs/export-manifest.sha256
git commit -m "docs: domain-binding sections across reference and tooling docs"
```

### Task E2: Changeset + full verification

**Files:**
- Create: `.changeset/domain-binding-baseline.md`

- [ ] **Step 1: Add the changeset**

Create `.changeset/domain-binding-baseline.md`:
```markdown
---
'@agentcommunity/aid': minor
'@agentcommunity/aid-engine': minor
'@agentcommunity/aid-doctor': minor
---

Make PKA domain binding the default. Discovery sends `AID-Domain` by default (`domain-binding=prefer`) and exposes `domainBound`; a new `domain-binding: off | prefer | require` policy lets clients require domain-bound proofs (the `strict` preset now requires them). `aid-doctor` shows domain-bound vs endpoint-proof-only, persists `domainBound` (cache schema v3), warns on binding loss, and accepts `--domain-binding`. Unbound `aid-pka-v2` proofs remain valid, so existing deployments are unaffected. The spec marks domain binding as optional-but-default with an `aid3` mandate trajectory.
```

- [ ] **Step 2: Full verification**

Run: `pnpm build && pnpm test && pnpm lint`
Expected: all green. Then `pnpm test:parity` — expected green (non-TS SDKs unchanged; the `aid-pka-v2-db` vectors remain inert for them).

- [ ] **Step 3: Commit**

```bash
git add .changeset/domain-binding-baseline.md
git commit -m "chore: changeset for domain-binding baseline"
```

---

## Appendix A — Non-TS SDK parity (SEPARATE follow-up plan)

This is intentionally NOT in the primary plan (large, language-specific, each SDK is its own shippable increment). Write a dedicated plan when picked up. Per-SDK scoping from review:

**Shared transformation recipe (every SDK):**
1. `buildAcceptSignatureV2`: add `"aid-domain";req` between `@authority` and `@status`; tag `aid-pka-v2-db` (send by default when a domain is available).
2. Covered-item whitelist: allow `aid-domain`.
3. Make covered-set validation **tag-aware** (4 components for `aid-pka-v2`, 5 incl `aid-domain` for `aid-pka-v2-db`) — requires parsing the tag *before* validating the covered set (a small reorder in .NET/Java).
4. Signature-base builder: emit `"aid-domain";req: <domain>` line; thread `domain` through.
5. Discovery entry: pass the queried A-label host; set the `AID-Domain` request header.
6. Accept both tags; surface a `domainBound` boolean on the discovery result (new result type for Go/Py/Rust/.NET; `DiscoveryResult` field for Java).
7. Add the `v2-db-rfc9421-domain-bound` (pass) and `v2-db-missing-aid-domain-coverage` (fail) vectors to that SDK's PKA vector test (most filter to `aid1` or select by id today).

**Per-SDK targets & size:**
- **Go** (`packages/aid-go/pka.go`, `discover.go`, `pka_v2_test.go`) — M. Best reference (cleanest v2 test harness). Do first.
- **Python** (`packages/aid-py/aid_py/pka.py`, `discover.py`, `tests/test_pka_vectors.py`) — M.
- **Rust** (`packages/aid-rs/src/pka.rs`, `discover.rs`; inline `#[cfg(test)]` vectors) — M (async).
- **.NET** (`packages/aid-dotnet/src/Handshake.cs`, `Discovery.cs`, `tests/PkaTests.cs`) — M (validation-order reorder).
- **Java** (`packages/aid-java/.../Handshake.java`, `Discovery.java`) — M–L (vector test harness is disconnected from `protocol/pka_vectors.json`; needs new shared-vector loader). Do last.

**Parity harness:** Go + Python are covered by `pnpm test:parity`; Rust/.NET/Java have separate CI gates.

---

## Self-Review

**Spec coverage:** Policy knob (B1–B3 + A2 spec), send-by-default (A2 §2.3 + B2/B3 conditional send), `require` enforcement (B1 enforcer + B2/B3 calls + C5 doctor), tooling surfacing (C1 engine, C4 output, D1–D3 web), cache+downgrade (C2/C3), trajectory (A1), docs (A1–A3, E1), changeset (E2). Non-TS parity scoped to Appendix A. ✅

**Placeholder scan:** Every code step shows concrete code or exact edits; test steps include assertions; a few steps say "match the file's existing pattern/name" for test-harness wiring (the test files' mock/render helpers vary) — these are pointers to verify a real symbol, not missing logic. Acceptable given the implementer reads the file; flagged explicitly where it occurs (C1, C4, D1, B3).

**Type consistency:** `DomainBindingPolicy = 'off'|'prefer'|'require'`, `domainBindingPolicy` option, `DiscoverySecurity.domainBinding = { policy, checked, bound }`, `enforceDomainBindingPolicy(security, queryName, pkaResult)`, `PkaBlock.domainBound`/`CacheEntry.domainBound`, status `'binding_loss'`, warning `'BINDING_LOSS'`, CLI `--domain-binding` — names used consistently across all tasks. ✅
