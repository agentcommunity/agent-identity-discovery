---
title: "Add AID to ERC-8004: keep discovery fast, keep identity portable"
description: "Why ERC-8004 needs a DNS-first discovery layer to stay fresh and portable"
author: Balazs Nemethi
date: 2026-01-30
tags: [aid, erc-8004, discovery, identity, agent]
---

# Add AID to ERC-8004: keep discovery fast, keep identity portable

ERC-8004 gives agents a portable on-chain identity: an ERC-721 token, a flexible registration file, a reputation trail, and a `services[]` list that can point to MCP, A2A, web, ENS, DID, and more. That is the right shape for identity and trust.

The weak spot is **discovery drift**.

Endpoints change. Protocol choices change. Infrastructure moves. The registration file that backs an 8004 agent can live on IPFS (content-addressed and immutable), on an HTTPS server, or even as a base64-encoded `data:` URI baked directly on-chain. None of these have live-routing semantics. If an MCP endpoint moves from `api-v1.acme.com` to `api-v2.acme.com`, the old pointer does not fix itself.

For IPFS-hosted registration files — the most common pattern for on-chain durability — the problem is worse. You cannot update an `ipfs://QmXyz...` file in place. You have to create a new file, pin it, obtain a new CID, and call `setAgentURI()` on-chain. On mainnet that costs gas; across 20+ chains where 8004 is deployed (Ethereum, Base, Arbitrum, Optimism, Mantle, and counting) that means repeating the process on every chain where your agent is registered. For what should be a sub-second routing update, you are looking at a multi-minute, multi-chain pipeline.

DNS does not have this problem. A TXT record update propagates globally in the time it takes for the TTL to expire — typically 5 to 15 minutes, configurable down to 60 seconds. No gas. No CID churn. No per-chain coordination.

That is exactly where AID fits.

---

## I — What is AID

Agent Identity & Discovery (AID) is a minimal, DNS-first bootstrap standard that answers one question: **"Given a domain, where is the agent and which protocol should I speak?"**

It does this with a single DNS TXT record at a well-known subdomain:

```
_agent.acme.com.  300  IN  TXT  "v=aid1;p=mcp;u=https://api.acme.com/mcp;a=oauth2_code;s=Acme AI Tools"
```

The record carries a protocol token (`mcp`, `a2a`, `openapi`, `grpc`, `graphql`, `websocket`), a URI to connect to, an optional auth hint, and a human-readable description. Richer protocols like MCP and A2A then take over for capability negotiation and runtime behavior.

AID deliberately avoids manifests, capability lists, orchestration, and trust scoring. It is a discovery and bootstrapping layer only — everything else belongs to the protocol on the other end.

Spec and SDKs: [aid.agentcommunity.org](https://aid.agentcommunity.org)

---

## II — Why add AID to ERC-8004

Adding AID is not about replacing the 8004 registration file. It is about giving it a **stable, human-readable pointer whose target can change without touching the chain**.

The responsibilities split cleanly:

| Layer | Owns | Update speed |
|-------|------|-------------|
| **ERC-8004** | Identity, ownership, reputation, trust signals, portable directory | On-chain (seconds to minutes + gas) |
| **AID (DNS)** | Live routing — which protocol, which URI, right now | DNS TTL (seconds, no gas) |

In practice this means:

- **Operators can rotate endpoints without chain writes.** Move from one cloud to another, upgrade from MCP to A2A, swap regions — update DNS once, done.
- **IPFS-hosted registration files stop going stale.** The `services[]` entry points to a domain, not a URI. The domain never changes; the DNS record behind it does.
- **Cross-chain agents update once, not N times.** An agent registered on Ethereum, Base, and Mantle updates its DNS record in one place. Every chain's registration file already points to the same domain.
- **Clients can start from a domain, not just an on-chain registry.** A human can type `acme.com`, get routed to the right agent, and optionally verify the on-chain identity afterward. This makes agent identities easier to share and harder to break.

---

## III — Minimal integration, zero contract changes

The 8004 spec states: *"The number and type of endpoints are fully customizable, allowing developers to add as many as they wish."* AID uses this extensibility. You add one entry to the existing `services[]` array in the registration file:

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "Agent XYZ",
  "description": "...",
  "image": "...",
  "services": [
    { "name": "A2A", "endpoint": "https://a2a.acme.com/.well-known/agent-card.json", "version": "0.3.0" },
    { "name": "MCP", "endpoint": "https://mcp.acme.com/" },
    { "name": "AID", "endpoint": "acme.com" }
  ],
  "registrations": [
    { "agentId": "42", "agentRegistry": "eip155:1:0x742d35Cc..." }
  ]
}
```

No new contract functions. No spec revision. One convention to document: **when `name` is `"AID"`, treat `endpoint` as a domain and resolve it via DNS.**

### Client algorithm

1. Find the `services[]` entry where `name == "AID"`.
2. Treat `endpoint` as a domain.
3. Query the DNS TXT record at `_agent.<domain>`.
4. Parse the AID record to learn the current protocol and connection URI.
5. Connect. Let MCP, A2A, or whatever protocol the record declares handle capability negotiation from there.

If the AID entry is missing, clients fall back to the other `services[]` entries as they do today. AID is additive, not a gate.

---

## IV — What the 8004 ecosystem gains

### Fast endpoint rotation

An 8004 agent on IPFS today must re-pin and re-anchor to change a single endpoint. With AID, the registration file's `"AID"` entry never changes — only the DNS record behind the domain does. TTL-based propagation means the new endpoint is live globally within minutes, not blocks.

### Chain-agnostic updates

ERC-8004 is deployed across Ethereum mainnet, Base, Arbitrum, Optimism, Mantle, and over a dozen testnets. An agent registered on three chains currently needs three `setAgentURI()` calls (and three gas payments) to rotate a single endpoint. With AID the domain is the stable anchor on every chain. Update DNS once — every chain's registration file resolves to the new target.

### Multi-protocol discovery without registration file bloat

AID supports protocol-specific subdomains: `_agent._mcp.acme.com`, `_agent._a2a.acme.com`. An agent that exposes both MCP and A2A can advertise a single `"AID"` domain in its 8004 registration, and clients discover which protocols are available today by querying the appropriate subdomain. Adding or removing a protocol is a DNS change, not a registration file rewrite.

### Stronger endpoint verification via PKA

ERC-8004 offers optional domain verification through `.well-known/agent-registration.json` — a JSON file proving the endpoint domain is controlled by the agent owner. AID's optional Public Key Attestation (PKA) goes further: the provider publishes an Ed25519 public key in the DNS record, and the server proves it holds the corresponding private key via an HTTP Message Signatures (RFC 9421) challenge-response. This gives 8004 agents a cryptographic endpoint proof that does not depend on serving a static file. The two mechanisms are complementary:

- **8004's `.well-known/agent-registration.json`** proves the domain owner acknowledges the on-chain identity.
- **AID's PKA** proves the server at the endpoint controls the private key advertised in DNS.

Together they create a chain of trust from on-chain identity through DNS to the live endpoint.

### No `.well-known` collision

ERC-8004 uses `/.well-known/agent-registration.json`. AID's HTTP fallback uses `/.well-known/agent` (a different path, returning a different format). They do not conflict and can coexist on the same domain.

---

## V — Addressing the obvious questions

**"Doesn't DNS add a centralization dependency?"**
DNS is the most battle-tested decentralized naming system on the internet. It is not trustless in the blockchain sense, but it is federated, redundant, and already the infrastructure that every `https://` endpoint in an 8004 `services[]` list depends on. AID does not add a new dependency — it makes an existing one explicit and useful. For environments that need stronger guarantees, DNSSEC provides cryptographic record integrity, and PKA adds endpoint proof on top.

**"What about 8004 v2?"**
The v2 spec is in development with enhanced MCP support and tighter x402 integration. AID remains valuable regardless: the fundamental property that DNS updates faster than any chain does not change with a new contract version. If anything, tighter MCP integration makes a fast MCP-endpoint-routing layer more useful, not less.

**"What if the agent doesn't have a domain?"**
Then the AID entry is simply absent and nothing changes. The other `services[]` entries (A2A, MCP, ENS) work exactly as they do today. AID is opt-in per agent.

---

## VI — Takeaway

ERC-8004 is a strong identity and trust substrate. Its registration file is the right place to declare *what* an agent is. AID is a minimal, domain-first discovery bootstrap. A single DNS TXT record is the right place to declare *where* an agent is right now.

Adding one `"AID"` service entry to an 8004 registration file lets DNS handle live routing while 8004 remains the stable on-chain anchor. No contract changes, no spec fork — just one documented convention that gives the ecosystem fast updates, cross-chain consistency, multi-protocol flexibility, and optional cryptographic endpoint proof.

Spec, SDKs in six languages, and a CLI validator: [aid.agentcommunity.org](https://aid.agentcommunity.org)
