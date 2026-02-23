---
title: 'Agent Identity & Discovery (AID)'
description: 'The DNS-based discovery protocol for the agentic web.'
icon: material/dns
---

[View raw markdown](https://github.com/agentcommunity/agent-identity-discovery/raw/main/packages/docs/index.md)

# Agent Identity & Discovery (AID)

> ## DNS for Agents. **Identity for the Agentic Web.**

> Type a domain. Connect to its agent. Instantly.

AID as the public address book for the agentic web.

It's a simple, open standard that uses the internet's own directory—DNS—to answer one question: **"Given a domain, where is its AI agent, and how do I know it's the real one?"**

No more hunting through API docs. No more manual configuration. It's the zero-friction layer for a world of interconnected agents.

!!! tip "New to AID?"
Start with [Core Concepts](Understand/concepts.md) for a quick overview, then follow the [Quick Start](quickstart/index.md) to publish your first agent.

[Try it Now — Live Resolver & Generator](https://aid.agentcommunity.org/workbench)

---

## Why It Matters

AID creates a seamless experience for everyone in the ecosystem.

!!! user "For Users: It Just Works - no setup wizard, no MCP copy-pasting."

    You want to connect your Notion to a new AI assistant. You type `notion.so`. The connection happens automatically. Your experience is instant.

!!! agent "For Agents: Autonomous Discovery - the foundation for true agent-to-agent interoperability"

    As an autonomous agent, you're tasked with analyzing a dataset stored in a Supabase project. You don't need to be pre-configured. You can programmatically discover the `supabase.com` agent endpoint, negotiate a connection, and complete your task.

---

## How It Works: The 30-Second Explainer

The entire mechanism is a single DNS lookup. It's simple, decentralized, and built on infrastructure that has powered the internet for decades.

1.  **Publish:** A provider (e.g., `supabase.com`) adds one `TXT` record to their DNS at a standard location: `_agent.supabase.com`.
2.  **Discover:** A client, given `supabase.com`, makes a single DNS query for the `TXT` record at that address.
3.  **Connect:** The record contains the agent's `uri`. The client uses it to connect directly.
4.  **Verify:** If a public key (`pka`) is present, the client performs a cryptographic handshake to prove the server's identity before use.

[Try this flow now](https://aid.agentcommunity.org/workbench)

```mermaid
flowchart LR
    A[Agent/User] --> B[Discover supabase.com]
    B --> C{DNS TXT at<br>_agent.supabase.com}
    C --> D[Connect via URI]
    D --> E{PKA Key Present?}
    E -->|Yes| F[Verify Identity] --> G[Use Agent]
    E -->|No| G
```

## Learn more

### Want the deep dive?

- [**Specification**](specification.md) – _The exact format, algorithms, and security rules._
- [**Core Concepts**](Understand/concepts.md) – _How DNS discovery, protocols, and identity fit together._
- [**Identity & PKA**](Reference/identity_pka.md) – _How AID provides cryptographic proof of an agent's identity._
- [**Rationale**](Understand/rationale.md) – _The design philosophy behind AID._
- [**Security Best Practices**](Reference/security.md) – _DNSSEC, redirect handling, local execution, IDN safety, TTL & caching._
- [**aid-doctor CLI**](Tooling/aid_doctor.md) – _Validate, secure, and generate AID records._

---

## SDKs and Tools

AID has official libraries and tools across multiple languages, with additional ports in progress.

- TypeScript/Node & Browser: `@agentcommunity/aid`
- TypeScript Core Library: `@agentcommunity/aid-engine` – Pure business logic for discovery, validation, and PKA
- CLI Tool: `@agentcommunity/aid-doctor` – Validate, secure, and generate AID records (wraps aid-engine)
- Python: `aid-discovery` (transfer to community planned)
- Go: `aid-go`
- Rust: `aid-rs`
- .NET: `aid-dotnet`
- Java: `aid-java`
- Web Workbench: Interactive generator/resolver

See the full package overview in the [Quick Start](quickstart/index.md#package-overview) and the cross-language [Discovery API](Reference/discovery_api.md).

---

## Use Cases

- Simple connections: Type a domain, connect automatically. No manual setup.
- Stronger trust (optional): Add identity proof to ensure you’re talking to the right service. See [Identity & PKA](Reference/identity_pka.md).
- Local and dev workflows: Safely run local agents with explicit consent; discover dev agents on your network.
- Multi-protocol ecosystems: Connect across MCP, A2A, OpenAPI, gRPC, GraphQL, or WebSocket.
- Smooth migrations: Deprecate old endpoints gracefully with clear timelines.
