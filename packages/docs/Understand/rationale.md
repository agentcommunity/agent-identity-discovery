---
title: 'Rationale'
description: 'Design Rationale'
icon: material/head-question-outline

extra_css_class: aid-page
---

[View raw markdown](https://github.com/agentcommunity/agent-identity-discovery/raw/main/packages/docs/Understand/rationale.md)

## **Agent Identity & Discovery (AID) v1.2: Rationale and Trade-offs**

**Date:** 31 August 2025
**Document Status:** Companion to the AID v1.2 Specification

### **1. Introduction**

This document provides the rationale behind the design decisions in the Agent Identity & Discovery (AID) v1.2 specification. A technical specification defines _what_ a standard is; this document explains _why_ it is that way. It outlines the core philosophy, highlights the protocol's strengths, defines its intentional limitations, and discusses the alternatives that were considered and rejected. Understanding these trade-offs is crucial for implementers, critics, and future contributors to the standard.

### **2. Core Philosophy: Pragmatism, Simplicity, and Decentralization**

The design of AID v1 is guided by a single, overarching principle: **Pragmatism over Purity**. Our goal is to create a standard that is immediately useful and adoptable by the widest possible audience. This led to three core tenets:

1.  **Embrace Existing Infrastructure:** The protocol leverages DNS TXT records, a technology that is universally supported, well-understood, and configurable by every domain owner on the planet. It avoids dependencies on newer, less-adopted standards or centralized services.
2.  **Minimize Complexity:** The v1 specification is intentionally lean. It solves one problem and one problem only: _discovering the primary entry point for an agent service_. By resisting the temptation to solve adjacent problems (like capability negotiation or rich configuration), AID v1 remains incredibly simple to implement for both providers and clients.
3.  **Default to Decentralization:** The protocol is inherently decentralized. There is no central registry, no required registration, and no single point of failure. If you own a domain, you can publish an AID record. This aligns with the foundational principles of the open internet.

### **3. What AID v1 Does Well (The Strengths)**

The minimalist design of AID v1 delivers several key advantages:

- **Ubiquitous and Immediate Deployability:** By using DNS TXT records, any service provider can implement AID today without waiting for new infrastructure to be deployed. Client libraries can be built with standard DNS resolvers available in every major programming language.
- **Unambiguous and Namespace-Safe Discovery:** The `_agent.<domain>` subdomain follows established conventions for service discovery ([RFC8552]), preventing collisions and keeping the root domain clean. The non-normative guidance for protocol-specific subdomains (e.g., `_agent._mcp.<domain>`) further demonstrates this flexibility.
- **Human-Readable and Easily Debuggable:** The `key=value` format is simple to read and write. A developer can debug any AID record with a single command (`dig TXT _agent.example.com`) without needing special tools, which dramatically lowers the barrier to entry. The optional `p` alias for `proto` is a minor but thoughtful concession to brevity in this human-readable context.
- **Superior User Experience via the `desc` Key:** The optional `desc` key is a small but critical feature. It allows a client to provide human-readable context _before_ a connection is made (e.g., "Connect to 'Google's AI Tools'?"), which builds user trust and clarity.
- **Elegant Support for Local Execution:** The `proto=local` token and its associated `uri` schemes (`docker:`, `npx:`, etc.) provide a clever, manifest-free way to support local agents. This retains the essence of a powerful use case from earlier, more complex drafts of AID without the overhead of a JSON manifest. It keeps the protocol lean while enabling a crucial feature.
- **Clear Path to the Future:** The specification explicitly acknowledges DNS SRV records as the likely path for a future `v=aid2`. This signals foresight, addresses technical purism, and assures the community that AID is an evolving standard, not a myopic, short-term fix.

### **4. What AID v1 Intentionally Does NOT Do (Defining the Boundaries)**

A successful standard is defined as much by the problems it _doesn't_ solve as by the ones it does. AID v1 is intentionally scoped to be a discovery and bootstrapping layer only.

- **It is NOT a Capability Discovery Protocol.**
  - **What it does:** AID tells a client that an endpoint speaks a certain protocol (e.g., `proto=mcp`).
  - **What it does NOT do:** It does _not_ describe what that agent can do (e.g., what tools it has, what resources it offers). That is the explicit job of the target protocol's own handshake (e.g., an MCP `initialize` request or an A2A `AgentCard` fetch).
  - **Rationale:** This separation of concerns is critical. It keeps AID simple and allows the communication protocols (MCP, A2A) to evolve their rich capability models independently of the discovery mechanism. Combining them would create a bloated and brittle standard.

- **It is NOT a Service Health or Uptime Protocol.**
  - **What it does:** AID provides a static pointer to a service endpoint.
  - **What it does NOT do:** It does not guarantee that the service at the URI is online, healthy, or responsive.
  - **Rationale:** Service health is a real-time, stateful concern. DNS is a slow-moving, cached system. Conflating the two is an architectural anti-pattern. The client is responsible for attempting a connection and handling failures.

- **It is NOT an Ongoing Authentication Protocol, but it IS an Identity _Bootstrap_ Protocol.**
  - **What it does:** With the optional `pka` key, AID provides cryptographic proof that the client is connected to the authentic server endpoint for a domain. This is a critical **identity verification** step that happens once, at the beginning of a session.
  - **What it does NOT do:** It does not handle session management, API tokens, or user-level authorization. That is the job of the application-layer protocol. AID's `auth` hint (`a=pat`) exists to guide this next step.
  - **Rationale:** This separation is key. AID solves the foundational trust problem: "Am I talking to the right server?" Once that trust is established via the PKA handshake, higher-level protocols can proceed with their own authentication mechanisms over a secure and verified channel.

!!! note
**Interoperability note:**  
 Some early MCP servers – notably Supabase’s TypeScript build – still rely on a Personal Access Token (`SUPABASE_ACCESS_TOKEN`) instead of the OAuth metadata flow mandated by MCP.  
 Clients can work around this by publishing `auth=pat` in their AID record and prompting the user for the PAT.  
 This workaround is temporary and _not_ part of the normative AID behaviour.

- **It is NOT a Rich Configuration Management System.**
  - **What it does:** AID provides a single URI.
  - **What it does NOT do:** It does not provide a complex set of environment variables, command-line arguments, or other configuration parameters.
  - **Rationale:** This is the most significant departure from earlier, more complex drafts. The `aid.json` manifest was powerful but also created a high barrier to entry. AID v1 posits that if an agent requires complex configuration, that should be handled by the agent's own onboarding flow, documentation, or CLI interface, not by the initial discovery protocol. Simplicity is paramount for a v1 standard.

### **5. Alternatives Considered and Rejected**

- **Full `aid.json` Manifest:** While powerful for describing complex local and remote implementations, the manifest-based approach was deemed too burdensome for a v1 standard. It required providers to host and maintain a JSON file, and clients to implement a significantly more complex resolution and validation logic. The new `proto=local` feature captures 80% of the manifest's value with 20% of the complexity.
- **DNS `SRV` or `HTTPS/SVCB` Records:** These are technically more "correct" for service discovery. However, they lack the universal, simple configuration support of `TXT` records in many DNS providers' dashboards. Furthermore, client-side resolver support is not yet ubiquitous. For v1, `TXT` offers the path of least resistance to adoption, with a clear migration path to `SRV`/`HTTPS` in the future.
- **Centralized Registry:** A central "Agent Store" or registry was rejected as it violates the principle of decentralization, creates a single point of failure, and introduces a gatekeeper to the ecosystem. DNS is the world's most successful decentralized registry, and AID leverages it directly.
- **Full Pkarr-style DHT Resolution:** We deeply admire the [Pkarr](https://pkarr.org/) project for its commitment to decentralized, censorship-resistant identity via a DHT. However, for AID's v1.2 goal of creating a minimal, immediately deployable bootstrap layer, requiring clients to implement DHT lookups and interact with relays was deemed too high a barrier to entry. Our `pka` key adopts Pkarr's core philosophy of key-as-identity but uses the existing DNS infrastructure to deliver it, staying true to our tenet of embracing existing, universal infrastructure.
- **DNS-First, with a Pragmatic `.well-known` Fallback**
  - **Why DNS is Primary:** DNS remains the superior tool for service discovery. It is faster, more efficient (a single UDP packet vs. a full TCP/TLS handshake), and allows for cryptographic verification of the record itself via DNSSEC.
  - **Why `.well-known` was Added:** We recognize that developers often do not control their domain's DNS records. Forcing them to file a ticket with an IT department creates friction. The `.well-known` fallback provides a crucial on-ramp, allowing a developer to implement AID by simply adding a file to their application's webroot, which is entirely within their control. This pragmatic choice drastically lowers the barrier to adoption.

### **6. Discovery vs Identity (and PKA in v1.2)**

Discovery answers “where and how do I connect?” Identity answers “am I really talking to who DNS pointed me to?” AID v1 keeps these responsibilities separate by design, then offers PKA as an optional, cryptographic proof to harden discovery without changing DNS.

- **Discovery (AID):** DNS TXT at `_agent.<domain>`, with protocol token and `uri`.
- **Transport security (TLS):** Mandatory for remote endpoints (`https://`/`wss://`).
- **Endpoint proof (PKA):** Optional `pka` (Ed25519 public key) plus `kid` lets clients verify the server controls the private key via HTTP Message Signatures (RFC 9421). This thwarts spoofed TXT records and MitM that cannot sign the challenge.
- **DNSSEC (recommended):** When present, clients should validate `RRSIG`. Together with PKA and TLS, this creates defense in depth.
- **Downgrade detection:** If a domain previously advertised `pka` and later removes it, clients should warn.

Practical outcomes:

- **Enterprise policy:** Require `pka` for sensitive connections; alert on downgrade.
- **Rotation:** Use `kid` for explicit key rotation without breaking clients.
- **Operational clarity:** `docs` and `dep` metadata provide human context and safe deprecations.

### **7. Practical Use Cases**

- **SaaS integration with trust:** `proto=mcp` + `pka`, user authenticates via the hinted scheme (e.g., `auth=pat` or OAuth), client verifies endpoint proof before sending tokens.
- **Vendor migration:** Publish new endpoint with `dep` on the old one; rotate PKA via `kid`; clients follow safely.
- **Hybrid local/remote:** Local dev via `proto=local`/`zeroconf:` with explicit consent, production via remote `https://` + PKA.
- **Multi-protocol exposure:** Same domain can expose `mcp`, `a2a`, or `openapi`; clients select supported protocol.
- **Development and operations:** Use the [aid-doctor CLI](../Tooling/aid_doctor.md) for validation, security checks, record generation, and PKA key management.

### **8. Conclusion**

AID v1 is a deliberately focused and pragmatic standard. It provides a simple, robust, and immediately deployable solution to the critical problem of agent discovery. By understanding what it does well and, just as importantly, what it _intentionally_ does not do, the community can build a powerful and interoperable ecosystem on a solid and stable foundation.

---

**Next Steps:**

- [Quick Start Guide](../quickstart/index.md)
- [Specification](../specification.md)
- [Security Best Practices](../Reference/security.md)

---

## Appendix: Full Protocol Flowchart

```mermaid
  graph TD
    A[User provides domain] --> B[Normalize domain to A-label]
    B --> C[Query DNS TXT record at _agent.domain]
    C --> D{DNS lookup successful?}
    D -->|No| E[ERR_DNS_LOOKUP_FAILED]
    D -->|Yes| F{Record exists?}
    F -->|No| G[ERR_NO_RECORD]
    F -->|Yes| H[Concatenate DNS strings if split]
    H --> I[Parse key=value pairs]
    I --> J{Contains v=aid1?}
    J -->|No| K[ERR_INVALID_TXT]
    J -->|Yes| L{Contains uri and proto?}
    L -->|No| K
    L -->|Yes| M[Extract values: uri, proto, auth, desc]
    M --> N{Client supports protocol?}
    N -->|No| O[ERR_UNSUPPORTED_PROTO]
    N -->|Yes| P{Protocol is 'local'?}
    P -->|Yes| Q[Check security safeguards]
    Q --> R{User consent given?}
    R -->|No| S[ERR_SECURITY]
    R -->|Yes| T[Execute local agent]
    P -->|No| U{URI uses HTTPS?}
    U -->|No| V[ERR_SECURITY]
    U -->|Yes| W[Validate DNSSEC if available]
    W --> X{DNSSEC valid?}
    X -->|Invalid| Y[ERR_SECURITY]
    X -->|Valid/Not present| Z[Connect to remote agent]
    Z --> AA{Connection successful?}
    AA -->|No| BB[Connection failed]
    AA -->|Yes| CC[Negotiate protocol]
    T --> CC
    CC --> DD{Protocol negotiation OK?}
    DD -->|No| EE[Protocol error]
    DD -->|Yes| FF[Agent ready for use]

    style A fill:#e1f5fe
    style FF fill:#e8f5e8
    style E fill:#ffebee
    style G fill:#ffebee
    style K fill:#ffebee
    style O fill:#ffebee
    style S fill:#ffebee
    style V fill:#ffebee
    style Y fill:#ffebee
    style BB fill:#ffebee
    style EE fill:#ffebee
```
