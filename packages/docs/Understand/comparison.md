---
title: 'Comparison'
description: 'How AID compares to centralized registries, .well-known, Pkarr, and DIDs.'
icon: material/scale-balance
---

# Comparison with Alternatives

AID is not the only way to discover AI agents. This page compares AID's approach to common alternatives, explaining when each makes sense and why AID chose its particular trade-offs.

## Feature Matrix

| Feature                  | AID                       | Centralized Registry | .well-known Only | Pkarr (DHT) | DIDs     |
| ------------------------ | ------------------------- | -------------------- | ---------------- | ----------- | -------- |
| Decentralized            | Yes                       | No                   | Partially        | Yes         | Yes      |
| No registration required | Yes                       | No                   | Yes              | Yes         | Varies   |
| Works with existing DNS  | Yes                       | N/A                  | N/A              | No          | No       |
| Sub-second discovery     | Yes                       | Depends              | Yes              | No          | No       |
| Offline/LAN support      | Yes (`zeroconf`, `local`) | No                   | No               | No          | Varies   |
| Cryptographic identity   | Optional (PKA)            | Varies               | No               | Built-in    | Built-in |
| Browser-compatible       | Yes (DoH + `.well-known`) | Yes                  | Yes              | Limited     | Limited  |
| Single-command debug     | Yes (`dig TXT`)           | No                   | `curl`           | No          | No       |
| Adoption barrier         | Very low                  | Medium               | Low              | High        | High     |

## AID vs Centralized Registries

**Centralized registries** (e.g., an "Agent Store") maintain a database of agent endpoints that clients query.

**Pros of registries:**

- Rich search and filtering (by capability, rating, etc.)
- Built-in trust signals (reviews, verification badges)
- Unified authentication

**Why AID chose differently:**

- Registries create a **single point of failure** and a **gatekeeper**. If the registry goes down or decides to delist you, your agent is undiscoverable.
- Registries require **registration** — someone has to approve you or you have to sign up. AID works the moment you add a DNS record.
- DNS is the internet's existing decentralized registry. It's faster, more reliable, and already deployed everywhere.

**When a registry makes sense:** Marketplace scenarios where users want to browse and compare agents. AID doesn't prevent this — a registry can _also_ publish AID records for its listed agents.

## AID vs `.well-known` Only

A `.well-known`-only approach skips DNS and serves agent metadata as a JSON file at `https://domain.com/.well-known/agent`.

**Pros of `.well-known` only:**

- No DNS access required
- Full JSON payload (not constrained by TXT record limits)
- Simple HTTPS-based discovery

**Why AID uses DNS first:**

- **Speed:** A DNS TXT lookup is a single UDP packet. A `.well-known` fetch requires TCP + TLS + HTTP — orders of magnitude slower.
- **DNSSEC:** DNS records can be cryptographically signed at the zone level, providing record integrity that `.well-known` over TLS cannot match.
- **Separation of concerns:** DNS is for discovery; HTTPS is for data transfer. Using the right tool for each job keeps the system clean.

AID includes `.well-known` as a **fallback**, not a replacement. Clients try DNS first, then fall back to `.well-known` only when DNS fails. This gives the best of both worlds: DNS speed and security when available, HTTP accessibility when not.

## AID vs Pkarr

[Pkarr](https://pkarr.org/) uses a distributed hash table (DHT) for self-sovereign, censorship-resistant identity. Public keys _are_ the identity — no DNS required.

**Pros of Pkarr:**

- True self-sovereignty — no dependency on DNS infrastructure
- Censorship-resistant — no authority can remove your records
- Key-as-identity is elegant and cryptographically pure

**Why AID chose differently:**

- **Adoption barrier:** Pkarr requires clients to implement DHT lookups and interact with relays. AID works with standard DNS resolvers available in every language.
- **Infrastructure reuse:** DNS is already deployed, cached, and understood. Introducing a DHT adds a new dependency that most developers don't have experience with.
- **Speed:** DNS lookups typically resolve in 1-50ms via cached resolvers. DHT lookups are inherently slower and less predictable.

**What AID borrowed from Pkarr:** AID's PKA system adopts Pkarr's core philosophy of key-as-identity but delivers it through DNS. The `pka` key in a TXT record serves the same conceptual purpose as a Pkarr public key — proving endpoint authenticity — but uses the existing DNS infrastructure to do it.

## AID vs DIDs (Decentralized Identifiers)

[DIDs](https://www.w3.org/TR/did-core/) are a W3C standard for decentralized identity. A DID resolves to a DID Document containing service endpoints, public keys, and verification methods.

**Pros of DIDs:**

- Rich identity documents with multiple service endpoints and keys
- Standardized by the W3C
- Multiple "methods" (did:web, did:key, did:ion, etc.) for different trust models

**Why AID chose differently:**

- **Complexity:** DID resolution requires understanding DID methods, DID documents, and verification relationships. AID's entire discovery is a single `dig` command.
- **Fragmentation:** The DID ecosystem has dozens of methods with varying adoption, maturity, and trust properties. There's no single "right" DID method.
- **Scope mismatch:** DIDs are a general-purpose identity framework. AID solves one specific problem: agent discovery. This focus keeps AID simple and immediately deployable.

**Complementary, not competing:** AID and DIDs serve different layers. A DID Document could reference an AID record for agent discovery, or an AID record could point to a DID for richer identity. They compose well rather than compete.

## When to Choose What

| Scenario                              | Recommended Approach               |
| ------------------------------------- | ---------------------------------- |
| Standard agent discovery for a domain | **AID**                            |
| Browsable marketplace of agents       | Centralized registry + AID records |
| No DNS access (hosted platform)       | AID with `.well-known` fallback    |
| Censorship-resistant identity         | Pkarr                              |
| Rich multi-purpose identity           | DIDs + AID for discovery           |
| Internal/corporate agent directory    | AID (works with private DNS)       |

## See Also

- [Rationale](rationale.md) — Full design philosophy and trade-offs
- [Core Concepts](concepts.md) — How AID's pieces fit together
- [Specification](../specification.md) — The formal protocol definition
