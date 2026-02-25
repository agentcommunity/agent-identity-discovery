# A2A Outreach Drafts

## Context

A2A has **no discovery mechanism**. The spec defines Agent Cards (what you find) but not how you find them. The only approach is `/.well-known/agent.json`, which requires knowing the domain already and is limited to one agent per base URL.

Discussion #741 (100+ comments) is deadlocked between overcomplicated camps — federated catalogs vs. SPIFFE/mTLS peer meshes vs. blockchain registries. Nobody has proposed DNS.

**Our position:** `_agent.<domain>` is enough. One TXT record. The `p=` field already tells you the protocol. No need for protocol-specific subdomains like `_agent._a2a.<domain>` — that's overengineering. And absolutely **no DID methods in DNS**. Domain ownership IS the identity. DNS zone control + DNSSEC is the trust model.

---

## 1. Comment for Discussion #741 (Agent Registry — THE priority)

**Where to post:** https://github.com/google/A2A/discussions/741

**Tone:** Offer a simple middle ground to break the deadlock. Not picking sides.

---

### Draft Comment

This is a fascinating thread. Reading through the 100+ comments, I see two camps:

- **Path A (Catalog Federation):** xRegistry-based catalogs, search APIs, implicit trust in operators
- **Path B (Peer Federation):** mTLS/SPIFFE handshakes, cryptographic sovereignty, explicit trust

Both are valuable for different scenarios. But I think there's a missing **Layer 0** underneath both — and it's the reason this thread has been open for so long without convergence.

The question is: *before* you query a registry, *before* you negotiate trust — how does a client discover that `example.com` even has an agent, and where to reach it?

Right now the answer is: you can't. You need the URL already, or someone tells you. `/.well-known/agent.json` only works if you already know the domain AND that domain controls its HTTP routing.

**DNS solves this.**

```
_agent.example.com. 300 IN TXT "v=aid1; p=a2a; u=https://api.example.com/.well-known/agent.json"
```

One TXT record. The `p=` field says "this domain speaks A2A." The `u=` field points to the Agent Card URL. Any DNS resolver on earth can answer the question "does example.com have an agent?" in milliseconds, with caching, without hitting any HTTP server.

**Why this helps both paths:**

- **For catalog advocates (Path A):** Registries can crawl `_agent.<domain>` TXT records as a discovery source — the way search engines use sitemaps. DNS becomes the decentralized index that catalogs aggregate.
- **For peer advocates (Path B):** DNS zone ownership is already a verified trust anchor. The entity that controls `example.com`'s DNS controls what `_agent.example.com` resolves to. Add DNSSEC and you get cryptographic proof of zone integrity. No new trust infrastructure needed.

**What this avoids:**

- No central registry dependency — DNS is already deployed globally
- No new identity systems — domain ownership IS the identity
- No DID/blockchain complexity — DNS zone control provides verifiable, delegatable, globally unique identity without an extra layer
- No single points of failure — DNS is the most resilient infrastructure on the internet

**On trust:** @SecureAgentTools made the point that "the choice of the discovery API IS the choice of the trust model." I agree. DNS-based discovery inherits DNS's trust model — zone ownership, delegation, DNSSEC. That's not a bolt-on; it's the foundation the internet already runs on. MX records trusted your email to the right server for 40 years with this model.

This pattern is implemented in [AID (Agent Identity & Discovery)](https://github.com/agentcommunity/agent-identity-discovery) with SDKs in 6 languages and a live diagnostic tool. The spec also supports optional PKA (Public Key Attestation) via Ed25519 for endpoint proof, but the discovery layer works without it.

I think DNS-based `_agent.<domain>` records could be the "Layer 0" that breaks this deadlock — simple enough for Path A to index, trustworthy enough for Path B to build on.

---

## 2. Comment for Issue #641 (Multi-Agent Discovery)

**Where to post:** https://github.com/google/A2A/issues/641

**Tone:** Build on @ieb's comment about DNS zone ownership. Offer a concrete solution.

---

### Draft Comment

@ieb's comment nails it:

> "There is an expectation that a single FQDN will be expected to route to one or more agents and may need to be discoverable by processing a resource at a well known path to decentralise agent registries and build on existing trust mechanisms. (DNS Zone ownership and TLS)"

This is exactly right. DNS zone ownership is the trust model — and DNS TXT records can solve the multi-agent problem more simply than RFC 9727 API Catalog.

Here's how: a domain publishes one or more TXT records at `_agent.<domain>`, each pointing to a different agent:

```
_agent.example.com. 300 IN TXT "v=aid1; p=a2a; u=https://api.example.com/agents/support; s=Support Agent"
_agent.example.com. 300 IN TXT "v=aid1; p=a2a; u=https://api.example.com/agents/sales; s=Sales Agent"
_agent.example.com. 300 IN TXT "v=aid1; p=mcp; u=https://api.example.com/mcp; s=MCP Tools"
```

A client resolving `_agent.example.com` gets all records back in a single DNS query. Each record specifies:
- `p=` — the protocol (a2a, mcp, openapi, etc.)
- `u=` — the endpoint URL (with arbitrary paths and ports)
- `s=` — a human-readable label

This removes the one-agent-per-`/.well-known` limitation without adding an API Catalog layer. DNS already handles multiple TXT records at the same name — that's how SPF, DKIM, and domain verification coexist today.

The trust model is what @ieb described: whoever controls the DNS zone controls what agents are advertised. Add DNSSEC for cryptographic integrity.

This is implemented in [AID](https://github.com/agentcommunity/agent-identity-discovery) — happy to discuss how it could complement A2A's existing Agent Card model.

---

## 3. Comment for Issue #378 (Agent Automatic Discovery)

**Where to post:** https://github.com/google/A2A/issues/378

**Tone:** Extend their LAN proposal to WAN. Short and focused.

---

### Draft Comment

The mDNS approach for LAN discovery (`_a2a._tcp.local`) makes sense — it's the same pattern Bonjour uses for printers and AirPlay.

The missing piece is the internet-scale equivalent. On the WAN, the analog to mDNS is a DNS TXT record:

```
_agent.example.com. 300 IN TXT "v=aid1; p=a2a; u=https://api.example.com/.well-known/agent.json"
```

Same concept — service discovery via DNS — just at internet scale instead of LAN scale. A client that wants to discover agents at `example.com` queries `_agent.example.com` TXT records, gets back the Agent Card URL, and fetches the card.

mDNS for local, `_agent.<domain>` TXT for internet. The two layers compose naturally.

This pattern is implemented in [AID](https://github.com/agentcommunity/agent-identity-discovery) with SDKs in 6 languages. The spec supports both remote endpoints (HTTPS URLs) and local agents (docker/npx/pip package URIs), so it covers the LAN-to-WAN spectrum.

---

## 4. Strategy: Where to Post and In What Order

### Sequence (staggered across days, separate from MCP posts)

**Day 1 (3-4 days after MCP PR #2127 comment):**
1. **Discussion #741** — Post the main comment (Draft #1 above). This is the highest-value target. 100+ comments, zero DNS proposals, deadlocked debate. Your comment breaks the deadlock with a simple middle ground.

**Day 2:**
2. **Issue #641** — Post the multi-agent comment (Draft #2 above). Build on @ieb's DNS zone ownership comment. Show concrete TXT records solving the one-agent-per-well-known limitation.

**Day 3 (optional):**
3. **Issue #378** — Post the LAN-to-WAN comment (Draft #3 above). Short, focused, extends their mDNS proposal.

### Key Messaging Rules (A2A-specific)

- **`_agent.<domain>` is enough.** Don't propose `_agent._a2a.<domain>`. The `p=a2a` field inside the TXT record already identifies the protocol. Protocol-specific subdomains are unnecessary complexity.
- **No DIDs, no blockchain, no SPIFFE.** Domain ownership is the identity. DNS zone control is the trust model. Don't engage with the DID proposals except to gently point out that DNS already provides globally unique, verifiable, delegatable identity.
- **Don't pick sides in the Path A vs Path B debate.** Position DNS as Layer 0 that both paths need. Catalogs can index DNS records. Peer federations can use DNS zone ownership as the trust anchor.
- **Reference @ieb and @SecureAgentTools by name.** They're making arguments that align with AID's philosophy. Build on their comments, don't compete with them.
- **One link to the AID repo, max.** Let the TXT record examples speak for themselves.

### What NOT to Do

- Don't open a new issue proposing "DNS-based Agent Discovery for A2A" yet — contribute to existing threads first
- Don't post A2A comments on the same days as MCP comments — it looks like a coordinated campaign
- Don't engage with the EIP-8004 / blockchain proposals — ignore them
- Don't propose `_agent._a2a.<domain>` subdomains — keep it `_agent.<domain>` with `p=a2a`
- Don't mention DIDs at all, even to contrast — just present DNS as the answer and let the simplicity speak

---

## 5. Combined MCP + A2A Posting Calendar

| Day | Target | Action |
|-----|--------|--------|
| **Day 1** | MCP PR #2127 | Main comment — DNS complements Server Cards, rebut rejection rationale, managed hosting gap |
| **Day 2** | MCP Registry #406 | Follow-up on your own issue — bridge to PR #2127 |
| **Day 2** | MCP Discussion #1147 | Short connector comment to PR #2127 |
| **Day 4** | A2A Discussion #741 | Main comment — DNS as Layer 0, break the deadlock |
| **Day 5** | A2A Issue #641 | Multi-agent discovery via multiple TXT records, build on @ieb |
| **Day 6** | A2A Issue #378 | LAN-to-WAN extension of mDNS proposal |
| **Day 8+** | Gauge reception | If positive: open formal issues/proposals on both repos |
