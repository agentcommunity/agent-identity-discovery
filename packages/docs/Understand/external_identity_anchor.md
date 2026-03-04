---
title: 'PKA as External Trust Anchor'
description: 'How AID PKA addresses the cross-boundary agent authentication problem — and what questions remain open.'
icon: material/earth-arrow-right
---

# DNS-Anchored Agent Identity: PKA as a Trust Anchor for Cross-Boundary Authentication

_An exploration of what AID's Public Key for Agent (PKA) mechanism can do today for cross-organizational agent identity, where the gaps are, and what the identity community needs to figure out next._

**Date:** 3 March 2026

---

## The Prompt

At an identity standards discussion in early 2026, Aaron Parecki (Director of Identity Standards, Okta; co-author of [OAuth 2.1](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/)) posed a challenge: what does it look like when an internal agent needs to operate outside its organization's boundary and prove, to an external party, that it has legitimate authorization to do so?

The scenario is concrete. An enterprise has deployed an AI agent internally. It has gone through the internal identity stack — SSO, SPIFFE SVID, policy evaluation, scoped OAuth tokens. Inside the boundary, the agent's identity and authorization are solved problems. The organization controls the IdP, the policy engine, and all the enforcement points.

Now that agent needs to call an external service. A vendor's API. A partner's MCP server. A SaaS tool operated by a different organization. The moment it crosses the boundary, the internal identity infrastructure becomes invisible to the external party. The SPIFFE SVID from `spiffe://acme.com/agent/procurement` means nothing to `vendor.com`. The OAuth token issued by Acme's Okta tenant carries scopes that `vendor.com` cannot validate. The external party has no trust relationship with Acme's token issuer.

What is missing is a **publicly discoverable, cryptographically verifiable signal** that says: _this agent belongs to this organization, and you can verify that without any prior enrollment or federation._

This post explores how AID's [PKA mechanism](../Reference/identity_pka.md) — a DNS-published Ed25519 public key with an RFC 9421 challenge-response handshake — addresses this problem, what it can do today, and the open questions that remain for the identity community.

---

## What Exists Today: The Agent Identity Landscape as of March 2026

The standards ecosystem is moving fast. In the first week of March 2026 alone, a new IETF draft landed that directly addresses AI agent authentication. Here is the landscape, as accurately as we can capture it.

### IETF Drafts

**[draft-klrc-aiagent-auth-00](https://datatracker.ietf.org/doc/draft-klrc-aiagent-auth/)** (published 2 March 2026) — authored by Kasselman (Defakto), Lombardo (AWS), Rosomakho (Zscaler), and Campbell (Ping Identity). This is the first IETF draft to explicitly model AI agents as workloads needing identifiers and credentials. Core principle: "Agent as Workload." Leverages WIMSE for cross-workload identity, SPIFFE for cryptographic identity, and OAuth for authorization. Crucially, the draft acknowledges that agents operating across organizational boundaries need mechanisms beyond what internal identity systems provide — but does not specify a public discovery mechanism for organizational identity.

**[WIMSE Architecture (draft-ietf-wimse-arch-06)](https://datatracker.ietf.org/doc/draft-ietf-wimse-arch/)** — Workload Identity in Multi-System Environments. The WIMSE working group has been refining the architecture for workload identity that spans trust domains. A key normative requirement: _each hop in a workload chain MUST explicitly scope and re-bind the security context._ This is directly relevant to multi-hop agent chains. The companion draft [draft-ni-wimse-ai-agent-identity-01](https://datatracker.ietf.org/doc/draft-ni-wimse-ai-agent-identity/) (Ni, Liu — Huawei) applies WIMSE concepts explicitly to AI agents with independent identities.

**[OAuth SPIFFE Client Auth (draft-ietf-oauth-spiffe-client-auth)](https://datatracker.ietf.org/doc/draft-ietf-oauth-spiffe-client-auth/)** — Schwenkschuster, Kasselman, and Rose (NIST). Defines how SPIFFE SVIDs (JWT or X.509) can be used as OAuth client credentials, eliminating static client secrets. This is a piece of the puzzle: SPIFFE-authenticated agents can obtain scoped OAuth tokens without long-lived keys.

**[BANDAID (draft-mozleywilliams-dnsop-bandaid-00)](https://datatracker.ietf.org/doc/html/draft-mozleywilliams-dnsop-bandaid-00)** — Uses DNS SVCB records (RFC 9460) for agent discovery, with DNSSEC for integrity. A complementary DNS-first approach that uses a different record type (SVCB vs. AID's TXT).

### Industry Initiatives

**Okta Cross App Access (XAA) / ID-JAG** — An open protocol extending OAuth/OIDC for managed agent-to-app access. The flow: SSO → ID token → Token Exchange (RFC 8693) → ID-JAG identity assertion → IdP evaluates enterprise policies. Now incorporated as the MCP authorization extension for enterprise-managed authorization. Supported by 20+ companies including AWS, Google Cloud, Salesforce, and Box. This solves the authorization evaluation problem elegantly — _within_ an IdP ecosystem. When the agent crosses out of that ecosystem, the external party still needs to verify the assertion's provenance.

**SPIFFE/SPIRE** — Rapidly becoming the foundational workload identity layer. The pattern: SPIFFE SVID → exchange for scoped OAuth/cloud credentials → no long-lived keys. Already deployed at scale at Uber, Block, AWS. The 2026 mandate is "No New Long-Lived Keys" — ephemeral, cryptographically verifiable identities everywhere. SPIFFE solves workload identity within and across trust domains, but trust domain membership requires enrollment. There is no public discovery mechanism for SPIFFE trust domains.

**IPSIE** (OpenID Foundation) — Interoperability Profile for Secure Identity in the Enterprise. Profiles OpenID Connect, SCIM, and Shared Signals for enterprise use. The 2025 whitepaper recommends treating agents as first-class IAM citizens with their own lifecycle management.

**Nametag Signa** — Verified Human Signatures for AI agent actions. Cryptographic proof that a specific human authorized a specific agent action. Launched at Oktane 2025. Orthogonal to organizational identity but composable with it: Signa says "a human approved this," while organizational identity says "this organization authorized this agent."

### The Gap

Every system above assumes some form of pre-established trust: IdP federation, SPIFFE trust domain enrollment, OAuth client registration, or shared token issuers. All of these require the parties to have a prior relationship before the agent shows up.

None of them answer the first-contact question: _I have never interacted with `acme.com` before. An agent claiming to represent Acme just called my API. How do I verify that claim right now, without calling Acme's IT department, without joining their IdP federation, without enrolling in their SPIFFE mesh?_

This is the gap AID PKA occupies.

---

## What AID PKA Does Today

AID's [specification (v1.2)](../specification.md) defines a DNS TXT record at `_agent.<domain>` containing, among other fields, an optional Ed25519 public key (`k`/`pka`) and a key rotation identifier (`i`/`kid`). Here is what a record with PKA looks like:

```dns
_agent.acme.com. 300 IN TXT "v=aid1;p=mcp;u=https://agent.acme.com/mcp;k=z6MkrTQ...;i=a1;a=oauth2_code"
```

When `k` is present, the [AID client algorithm](../specification.md#23-client-discovery-algorithm) requires a PKA handshake before trusting the endpoint. The handshake is defined in [Appendix D](../specification.md#appendix-d-pka-handshake-normative) and works as follows:

### The PKA Handshake (RFC 9421 HTTP Message Signatures)

```
1. Client generates 32 random bytes, base64url-encodes them as `nonce`
2. Client sends GET to the discovered URI with headers:
     AID-Challenge: <nonce>
     Date: <current UTC>

3. Server signs the following fields using its Ed25519 private key:
     "AID-Challenge": <nonce>
     "@method": GET
     "@target-uri": https://agent.acme.com/mcp
     "host": agent.acme.com
     "date": <UTC timestamp>

4. Server responds with HTTP headers:
     Signature-Input: sig=("AID-Challenge" "@method" "@target-uri" "host" "date");
                      created=1709420000;keyid="a1";alg="ed25519"
     Signature: sig=:<base64-encoded-ed25519-signature>:

5. Client verifies:
   a. Resolve _agent.acme.com, extract k (public key) and i (kid)
   b. Decode the multibase (z-prefix, base58btc) public key → 32 bytes Ed25519
   c. Verify |now - created| ≤ 300 seconds (freshness)
   d. Verify keyid matches kid from DNS
   e. Verify Ed25519 signature over the canonical signature base (per RFC 9421)
   f. If all checks pass → endpoint is authentic for acme.com
```

This is implemented across [six language SDKs](../quickstart/index.md): TypeScript, Go, Python, Rust, .NET, Java — all validated against [shared test vectors](https://github.com/agentcommunity/agent-identity-discovery/blob/main/protocol/pka_vectors.json).

### What This Proves

The PKA handshake establishes exactly one thing: **the server at the discovered URI controls the Ed25519 private key corresponding to the public key published in `_agent.acme.com`'s DNS TXT record.**

Combined with the other layers in AID's [defense-in-depth model](../Reference/security.md):

| Layer | What It Proves |
|---|---|
| **DNS TXT at `_agent.<domain>`** | The entity controlling `acme.com`'s DNS zone has declared this endpoint as their agent |
| **DNSSEC** (recommended) | The DNS response has not been tampered with in transit |
| **TLS** (required) | The transport is encrypted and the server's TLS certificate is valid for the host |
| **PKA** (optional) | The server controls the private key matching the DNS-published public key |

The chain of trust is: DNS zone control → TXT record publication → Ed25519 key binding → challenge-response proof. An attacker would need to compromise DNS zone administration _and_ obtain the Ed25519 private key to impersonate an agent endpoint.

### What This Does NOT Prove

Here is where intellectual honesty matters. PKA today proves **endpoint authenticity**. It does not prove:

- That a specific OAuth token was issued by `acme.com`
- That a specific SPIFFE SVID belongs to `acme.com`'s trust domain
- That `acme.com`'s internal policies have authorized this particular agent action
- That the agent's request carries valid delegated authorization from a human or system at `acme.com`

PKA tells you: "The server you're talking to is genuinely operated by whoever controls `acme.com`." It does not tell you: "The credential this agent is presenting was genuinely issued by `acme.com`."

This distinction matters enormously for the cross-boundary scenario Aaron described. An external party doesn't just need to know the agent is _from_ Acme — they need to know the agent is _authorized by_ Acme for this specific action.

---

## The SPF/DKIM/DMARC Analogy (and Where It Breaks Down)

Email had an identical problem. Before SPF/DKIM/DMARC, anyone could send email claiming to be from `acme.com`. The solution was DNS-based:

| Email Auth | What It Does | AID Equivalent |
|---|---|---|
| **SPF** | DNS TXT declaring which IP addresses can send email for a domain | **AID TXT**: DNS declaring which endpoint serves the agent for a domain |
| **DKIM** | DNS TXT publishing a public key; email headers signed with the private key | **PKA**: DNS TXT publishing a public key; HTTP headers signed with the private key |
| **DMARC** | DNS TXT declaring the domain's authentication policy (what to do on failure) | **Enterprise security modes**: `balanced` vs `strict` policy presets |

The parallel is striking and not accidental. Both AID and SPF/DKIM are DNS-anchored identity systems that use public key cryptography to bind a domain to a verifiable action (sending email / serving an agent endpoint).

**Where the analogy breaks down:** DKIM signs _the email itself_ — the content, the headers, the envelope. The signature travels with the message and is verifiable by any recipient. AID PKA signs _a challenge-response exchange at connection time_. The proof is ephemeral. It does not travel with subsequent requests. It does not bind to credentials or tokens.

This is the fundamental gap. To extend the analogy: AID today has SPF (endpoint declaration) and a connection-time form of DKIM (endpoint proof). What it lacks is the equivalent of a DKIM signature that travels _with_ a credential or assertion and is verifiable by any party, at any time, against the DNS-published key.

---

## The Three Modes of PKA: Present, Extended, Hierarchical

Given the current PKA mechanism and the cross-boundary authentication challenge, there are three distinct operating modes worth exploring. These are not spec proposals — they are conceptual frameworks for the identity community to evaluate.

### Mode 1: PKA-Present (What Exists Today)

**Mechanism**: Challenge-response at connection time.
**Proves**: Endpoint authenticity.
**Limitation**: Proof is ephemeral and does not bind to credentials.

This is the current AID v1.2 implementation. It is already valuable for the first-contact problem: before an external party even considers an agent's credentials, it can verify that the agent's claimed domain is real and that the endpoint is authentic. This is not nothing — it eliminates an entire class of impersonation attacks.

**Example flow today:**

1. Agent from `acme.com` connects to `vendor.com`'s MCP server
2. `vendor.com` discovers `_agent.acme.com`, performs PKA handshake → verified
3. `vendor.com` now knows it is genuinely communicating with `acme.com`'s agent infrastructure
4. Agent presents an OAuth token → `vendor.com` knows the token came from a verified Acme endpoint, but cannot independently verify the token was issued by Acme's IdP

Step 3 is a meaningful trust improvement over the status quo, where `vendor.com` has no way to verify anything about the calling agent before processing its credentials.

### Mode 2: PKA-Extended (Credential Binding)

**Concept**: The same Ed25519 key pair used for PKA endpoint proof is also used to sign a binding between the organization's domain and a credential.
**Would prove**: "This credential was issued by the organization that controls `acme.com`."
**Status**: Does not exist. Open design question.

The idea is straightforward: if Acme's AID record publishes Ed25519 public key `K`, and Acme's infrastructure signs an assertion like "OAuth token `T` was issued by `acme.com` for agent `A` with scopes `S`, valid until `exp`" using the corresponding private key `k`, then any external party can:

1. Resolve `_agent.acme.com` → extract `K`
2. Verify the signature on the assertion using `K`
3. Now has cryptographic proof that `acme.com` bound this credential

The binding could take multiple forms:

**Option A: PKA-Signed JWT.** A JWT where `iss` matches the AID domain and the signature is verifiable against the PKA public key. This is compact and uses a widely understood format.

```
Header:  { "alg": "EdDSA", "kid": "a1" }
Payload: { "iss": "acme.com", "sub": "agent:procurement", "scope": "read:catalog",
           "iat": 1709420000, "exp": 1709420300, "cnf": { "jkt": "<token-thumbprint>" } }
Signature: Ed25519(private_key, header.payload)
```

Verification: resolve `_agent.acme.com`, decode `k`, verify signature. No IdP federation required.

**Option B: AID-Attestation HTTP Header.** A new structured HTTP header carrying a signed binding, following the RFC 9421 pattern AID already uses. This would be more consistent with the existing PKA mechanism but less portable.

**Option C: Detached Signature over Existing Token.** Rather than issuing a new token, sign the existing OAuth token (or a hash of it) with the PKA key. This composes with existing token infrastructure — the OAuth token flow is unchanged; the PKA signature is an additional binding.

**Open questions for PKA-Extended:**

- **Key purpose separation.** The current PKA key serves one purpose: endpoint proof. Extending it to sign organizational attestations increases the private key's exposure surface. Should the same key be reused (simpler, one DNS field), or should a separate attestation key be introduced (cleaner separation, more DNS complexity)?
- **Signing context isolation.** If the same key is reused, the signing contexts must be unambiguously distinct. RFC 9421 already provides `Signature-Input` parameters that distinguish different signing purposes. A convention-based approach — same key, different signing context — aligns with AID's philosophy but needs careful design to prevent cross-context signature replay.
- **Token format fragmentation.** JWTs are widely understood but add a dependency. Structured HTTP headers are more aligned with AID's style but less portable. The identity community should weigh in on which format best serves interoperability.
- **Freshness and replay.** PKA handshakes use a 300-second freshness window. Organizational attestations might need different validity windows — long enough to be useful across a multi-hop chain, short enough to limit exposure. What is the right TTL?
- **Revocation.** DNS TTLs provide a natural revocation mechanism for the public key itself (rotate the key, wait for TTL expiry). But what about individual attestations? Does the identity community need a revocation mechanism per-attestation, or is short validity + key rotation sufficient?

### Mode 3: PKA-Hierarchical (Multi-Domain Trust)

**Concept**: In organizations with multiple AID records across subdomains, establishing trust relationships between PKA keys at different levels.
**Would address**: The "which key represents the organization?" question.
**Status**: Completely unexplored. Fundamental design question.

Consider an enterprise with:

```dns
_agent.acme.com         → k=z6MkRoot...;i=r1    (root organizational key)
_agent.sales.acme.com   → k=z6MkSales...;i=s1   (sales team agent)
_agent.eng.acme.com     → k=z6MkEng...;i=e1     (engineering agent)
_agent.app.eng.acme.com → k=z6MkApp...;i=a1     (specific application agent)
```

Today, these are four independent, unrelated PKA key pairs. Each proves endpoint authenticity for its own domain. There is no relationship between them.

**Question 1: Should there be a hierarchy?** Should `_agent.acme.com`'s PKA key be interpretable as an organizational root that can attest for subdomain agents? This would be powerful for the cross-boundary case: an external party could verify that `app.eng.acme.com`'s agent was authorized by `acme.com`, the organizational root. But it also introduces complexity and a single point of compromise.

**Question 2: Delegation vs. independence.** AID's [exact-host semantics](../specification.md#24-exact-host-semantics-and-explicit-delegation) (Section 2.4) are deliberately flat: `_agent.app.team.example.com` does not inherit from `_agent.team.example.com`. This is a security feature — it prevents unintended trust inheritance. Introducing a PKA hierarchy would need to work _with_ this design, not against it. Possible approach: explicit delegation records, similar to how DNS `CNAME` already handles shared records, where the root domain's PKA key signs a statement delegating authority to a subdomain's PKA key.

**Question 3: DNS zone boundaries.** In large organizations, different subdomains are often managed by different DNS zones with different administrators. A PKA hierarchy that assumes a single administrator controls all subdomain keys may not reflect operational reality. This is the same problem DMARC faces with organizational domain alignment, and the DMARC community's experience could inform AID's design.

**Question 4: Revocation in a hierarchy.** If the root key is compromised, what happens to all delegated subdomain attestations? Key rotation at the root would need to cascade. This is operationally expensive and error-prone. The identity community has extensive experience with hierarchical PKI (X.509) and its revocation challenges (CRL, OCSP). AID should learn from those lessons rather than repeat them.

---

## How AID Composes with the Existing Stack

AID's [design philosophy](../Understand/rationale.md) is explicit: it is a discovery and identity _bootstrap_ layer. It does not replace OAuth, SPIFFE, WIMSE, or XAA. It occupies a specific position in the stack:

```
┌──────────────────────────────────────────────────────────┐
│  Layer 3: Application Authorization                      │
│  OAuth 2.1 · Token Exchange · XAA/ID-JAG · Trans. Tokens │
│  "What can this agent do?"                               │
├──────────────────────────────────────────────────────────┤
│  Layer 2: Workload Identity                              │
│  SPIFFE/SPIRE · WIMSE · Internal IdP                     │
│  "What workload is this agent, within its trust domain?" │
├──────────────────────────────────────────────────────────┤
│  Layer 1: Public Identity Anchor                         │
│  AID · DNS + DNSSEC + TLS + PKA                          │
│  "Who is this agent's organization?"                     │
└──────────────────────────────────────────────────────────┘
```

### AID + SPIFFE: Public Discovery for Private Identity

SPIFFE trust domains are private namespaces. `spiffe://acme.com/agent/procurement` is only meaningful to participants in Acme's trust domain. When crossing organizational boundaries, the external party needs to verify the trust domain itself.

AID provides this. The mapping: `spiffe://acme.com/...` → verify `_agent.acme.com` PKA → the organization behind this SPIFFE trust domain is cryptographically confirmed. This does not prove the specific SVID is valid (that requires SPIFFE bundle exchange), but it proves the trust domain's organizational identity — which is the prerequisite for deciding whether to accept the SVID at all.

### AID + WIMSE: External Verification at Each Hop

WIMSE's "each hop MUST explicitly scope and re-bind the security context" creates a natural integration point. At each organizational boundary in a multi-hop agent chain, AID PKA can provide the external identity verification that WIMSE's architecture requires. The receiving hop can verify the sending organization's AID identity before accepting and re-scoping the security context.

### AID + XAA/ID-JAG: The Pre-Federation Verification Layer

Okta's XAA flow works within an IdP ecosystem. The agent authenticates via SSO, obtains an ID-JAG assertion, and presents it to the target application. The target application can then check with the IdP whether the assertion is valid.

For cross-organizational scenarios, the target application is not part of the enterprise's IdP ecosystem. AID can serve as the verification layer that bridges this gap: before the target even processes the ID-JAG assertion, it can verify the asserting organization's identity via AID PKA. This is not a replacement for XAA — it is the external verification that makes XAA assertions meaningful _outside_ the IdP ecosystem.

### AID + draft-klrc-aiagent-auth: Identity Anchor for "Agent as Workload"

The KLRC draft models agents as workloads needing identifiers and credentials. It relies on SPIFFE for identity and OAuth for authorization. AID provides the publicly verifiable anchor that the workload's organizational identity binds to. The draft leaves the first-contact discovery problem unaddressed; AID fills that gap.

---

## Why DNS: The Deep Case

This is not just about convenience. DNS is the internet's existing organizational identity layer. This has implications that go deeper than "it's already deployed."

**Domain ownership is organizational identity.** On the internet, organizations are identified by domain names. This is why every major identity system — TLS certificates, SPF/DKIM, OAuth issuer URLs — ultimately roots in DNS. When you verify that `acme.com` controls a specific public key, you are verifying organizational identity through the same mechanism that already underpins internet trust.

**DNS is the only globally consistent namespace.** SPIFFE trust domains, DID methods, and internal IdP realms are private namespaces requiring prior knowledge to resolve. `_agent.acme.com` is resolvable by any DNS client on the planet, from any network, without any prior arrangement.

**DNS is already the organizational boundary.** Internal services use internal DNS. External services use public DNS. The DNS boundary _is_ the organizational boundary. AID's `_agent.<domain>` record sits at exactly this boundary — the natural place for externalizing internal identity claims.

**DNS has a 40-year operational track record.** Continuously operating since 1985. The most battle-tested infrastructure for any internet-scale system. Choosing DNS as the trust anchor is choosing the infrastructure with the highest probability of still working in 2036.

AID's [comparison page](../Understand/comparison.md) evaluates the alternatives (centralized registries, `.well-known`-only, Pkarr DHTs, DIDs) and explains the specific trade-offs. The [rationale](../Understand/rationale.md) goes deeper into the "Pragmatism over Purity" philosophy. For the cross-boundary identity problem specifically, DNS provides the critical property that no alternative matches: **zero-enrollment verifiability.**

---

## Open Questions for the Identity Community

These are the questions we believe need community input. They are not rhetorical — they represent genuine design decisions that will shape whether DNS-anchored agent identity becomes part of the broader identity stack.

### 1. Is PKA-Extended the right approach, or should credential binding be a separate mechanism?

The argument for extending PKA: the Ed25519 key is already published in DNS, already has rotation semantics (`kid`), and already has a verification flow (RFC 9421). Adding a new signing context is minimal incremental complexity.

The argument against: conflating endpoint proof and organizational attestation in a single key pair increases the blast radius of key compromise and makes the security model harder to reason about. A separate attestation key (published in a separate DNS record or a new field) would be cleaner.

### 2. What format should organizational attestations take?

JWTs are universally understood by the identity community. RFC 9421 structured fields are more aligned with AID's HTTP-native approach. A novel format risks fragmentation. The identity community's preference matters here because the format needs to be processable by existing token validation infrastructure.

### 3. How should multi-domain PKA trust work?

Flat (independent keys per subdomain) is simple and secure. Hierarchical (root key attests for subdomain keys) enables powerful organizational delegation but introduces PKI complexity. The X.509 CA model has extensive operational experience with this problem — both the benefits and the pain. What lessons should AID learn?

### 4. What is the right validity window for organizational attestations?

PKA handshakes use 300 seconds (5 minutes). This makes sense for ephemeral endpoint proof. For organizational attestations that need to survive multi-hop agent chains, 5 minutes might be too short. For attestations that bind to OAuth tokens, the attestation's validity should probably match the token's. But longer validity windows increase the replay window. What is the right balance?

### 5. Is DNSSEC sufficient for key integrity, or does PKA need its own revocation mechanism?

DNS TTL-based key rotation is AID's current approach to key lifecycle. When you rotate the key, the old one stops being served after TTL expiry. This is simple and works well for endpoint proof. For organizational attestations, the question is whether you need to revoke individual attestations (not just rotate the key). The email identity community's experience with DKIM key rotation — and the notable absence of per-signature revocation — is relevant here.

### 6. How does this compose with DID methods?

AID deliberately [chose PKA over DIDs](../Reference/identity_pka.md#why-pka-instead-of-a-did-scheme) for its bootstrap layer, citing complexity and fragmentation in the DID ecosystem. But for organizations already invested in DIDs, the composition question matters: can an AID record reference a DID, or can a DID Document reference an AID record? Both are technically possible. The question is which composition is useful in practice for the cross-boundary agent auth use case.

### 7. What happens when both parties have AID records?

The most interesting scenario for cross-boundary authentication is mutual verification: both the calling agent and the receiving agent have AID records with PKA. This enables a symmetric trust establishment that is fundamentally different from the asymmetric client-server model of OAuth. Is there a useful protocol pattern here — where both parties simultaneously verify each other's organizational identity via AID PKA before engaging in any credential exchange?

### 8. How does AID interact with the MCP authorization specification?

The Model Context Protocol has its own [authorization framework](https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/authorization/) based on OAuth 2.1 with PKCE. XAA/ID-JAG has been incorporated as an MCP extension for enterprise-managed authorization. AID's PKA could serve as an additional verification layer: before the MCP OAuth flow begins, the client verifies the server's organizational identity via AID PKA. But should this be formalized in the MCP spec, in the AID spec, or in an integration profile?

---

## What AID Should Not Become

AID's [specification](../specification.md) is deliberately minimal. The rationale document says it clearly: AID is a _discovery and identity bootstrap protocol_. It answers one question: "Given a domain, where is the agent and which protocol should I speak?"

Extending AID to address cross-boundary authentication must preserve this minimalism. AID should not become:

- **A token issuer.** AID should provide the verification anchor that token issuers bind to, not issue tokens itself.
- **A policy engine.** AID should provide the identity foundation that policy engines reference, not evaluate policies.
- **A capability description system.** AID should prove who agents are, not what they can do. That is explicitly the target protocol's job.
- **A session manager.** AID bootstraps trust. Session management is the agent protocol's responsibility.

Any extension to PKA for organizational attestation should be the minimum necessary to enable external parties to verify organizational identity claims. One additional signing context. One additional header or token format. No more.

---

## Where to Go From Here

The path forward is not primarily a specification effort. It is a conversation with the identity community.

**Phase 1: Validate the framing.** Is "publicly discoverable organizational identity anchor" the right abstraction for the cross-boundary agent auth problem? Does the identity community agree that this is a genuine gap in the current standards landscape? The WIMSE working group, the OAuth working group, and the authors of draft-klrc-aiagent-auth are the right audiences.

**Phase 2: Explore PKA-Extended.** If the framing is right, prototype the credential binding mechanism. Start with the simplest possible approach — a PKA-signed JWT where `iss` matches the AID domain — and test it against real-world cross-organizational agent authentication scenarios.

**Phase 3: Integration profiles.** Write concrete integration documents: AID + SPIFFE, AID + OAuth, AID + XAA/ID-JAG. These should be specific enough that an implementer can build them, not just architectural hand-waving.

**Phase 4: Formalize.** If the integration profiles prove useful, follow the [AID spec extension process](https://github.com/agentcommunity/agent-identity-discovery/blob/main/tracking/SPEC_EXTENSION_PROCESS.md) to formalize any new fields or conventions.

The AID specification, SDKs, and documentation are open source at [github.com/agentcommunity/agent-identity-discovery](https://github.com/agentcommunity/agent-identity-discovery). The PKA mechanism is implemented and tested across six languages. The DNS infrastructure is already deployed everywhere. The question is not whether the infrastructure is ready — it is whether the identity community wants to build on it.

---

## References

### AID Specification and Documentation

- [AID Specification v1.2](../specification.md) — the normative protocol definition
- [PKA (Identity & Public Key for Agent)](../Reference/identity_pka.md) — PKA mechanism details and rationale
- [Security Best Practices](../Reference/security.md) — threat model and defense-in-depth
- [Design Rationale](../Understand/rationale.md) — philosophy and trade-offs
- [Comparison with Alternatives](../Understand/comparison.md) — AID vs registries, .well-known, Pkarr, DIDs

### IETF Drafts and Standards

- [OAuth 2.1 (draft-ietf-oauth-v2-1-14)](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/) — Hardt, Parecki, Lodderstedt
- [AI Agent Authentication (draft-klrc-aiagent-auth-00)](https://datatracker.ietf.org/doc/draft-klrc-aiagent-auth/) — Kasselman, Lombardo, Rosomakho, Campbell
- [WIMSE Architecture (draft-ietf-wimse-arch-06)](https://datatracker.ietf.org/doc/draft-ietf-wimse-arch/)
- [WIMSE AI Agent Identity (draft-ni-wimse-ai-agent-identity-01)](https://datatracker.ietf.org/doc/draft-ni-wimse-ai-agent-identity/)
- [OAuth SPIFFE Client Auth (draft-ietf-oauth-spiffe-client-auth)](https://datatracker.ietf.org/doc/draft-ietf-oauth-spiffe-client-auth/)
- [BANDAID (draft-mozleywilliams-dnsop-bandaid-00)](https://datatracker.ietf.org/doc/html/draft-mozleywilliams-dnsop-bandaid-00)
- [RFC 9421 — HTTP Message Signatures](https://www.rfc-editor.org/rfc/rfc9421)
- [RFC 8693 — Token Exchange](https://www.rfc-editor.org/rfc/rfc8693)

### Industry

- [Okta Cross App Access (XAA)](https://www.okta.com/identity-101/cross-app-access-securing-ai-agent-and-app-to-app-connections/)
- [SPIFFE.io](https://spiffe.io/)
- [IPSIE Working Group](https://openid.net/wg/ipsie/)
- [Nametag Signa](https://getnametag.com/newsroom/agentic-ai-security-verified-human-signatures)
