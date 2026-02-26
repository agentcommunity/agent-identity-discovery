---
title: 'FAQ'
description: 'Frequently asked questions about AID, DNS discovery, PKA, and the SDKs.'
icon: material/frequently-asked-questions
---

# Frequently Asked Questions

## Why DNS and not a centralized registry?

DNS is the internet's existing, decentralized directory. Every domain owner already has access to it. There's no registration step, no approval process, and no single point of failure. A centralized "agent registry" would create a gatekeeper and a dependency — the opposite of the open, decentralized web that AID is designed for.

DNS TXT records are supported by every DNS provider, debuggable with `dig`, and cacheable by the global resolver infrastructure. AID leverages all of this for free.

See the [Rationale](rationale.md) for the full design philosophy.

## Do I need DNSSEC?

**Recommended but not required.** DNSSEC cryptographically signs your DNS records, preventing tampering in transit between your nameserver and the client's resolver. Most managed DNS providers (Cloudflare, Vercel, Route 53) offer one-click DNSSEC activation.

Without DNSSEC, AID still works — TLS protects the connection itself, and PKA (if enabled) proves the server's identity. DNSSEC adds a third layer of defense by protecting the DNS record that points to the server.

## What if I can't edit DNS?

Use the **`.well-known` fallback**. Instead of a DNS TXT record, serve a JSON file at:

```
GET https://yourdomain.com/.well-known/agent
```

```json
{
  "v": "aid1",
  "u": "https://api.yourdomain.com/mcp",
  "p": "mcp",
  "s": "My Agent"
}
```

AID clients try DNS first and fall back to `.well-known` only when DNS fails. This is ideal for developers who don't have DNS access (e.g., hosted platforms, corporate IT restrictions).

See [.well-known JSON](../Reference/well_known_json.md) for the full specification.

## Is PKA required?

**No.** PKA (Public Key Attestation) is optional. AID works without it — DNS + TLS provides a solid baseline.

PKA adds cryptographic proof that the server at the discovered URI actually controls the private key published in DNS. It's recommended for production deployments where trust matters, but you can start without it and add it later.

See [Identity & PKA](../Reference/identity_pka.md) for implementation details.

## How does AID relate to MCP and A2A?

AID is the **discovery layer** — it tells you _where_ an agent is and _what protocol_ it speaks. MCP and A2A are **communication protocols** — they define _how_ to talk to the agent once you've found it.

```
AID:  "The agent for example.com is at https://api.example.com/mcp, speaking MCP."
MCP:  "Here are my tools: search, summarize, translate..."
```

AID doesn't replace MCP or A2A. It's the directory lookup that happens before the protocol handshake. You can use AID with any of the 9 supported protocol tokens.

## What about multiple agents on one domain?

The primary `_agent.<domain>` record points to the domain's main agent. For additional agents, AID v1.1 provides **protocol-specific subdomains** (non-normative guidance):

```
_agent.example.com          → primary agent (MCP)
_agent._a2a.example.com     → A2A agent
_agent._openapi.example.com → OpenAPI endpoint
```

Clients query the protocol-specific subdomain when they know which protocol they want, and fall back to the primary `_agent.<domain>` record.

## How do I migrate from v1.0 to v1.1?

v1.1 is **fully backward-compatible** with v1.0. All v1.0 records are valid v1.1 records — no changes needed.

To take advantage of v1.1 features:

1. **Key aliases:** Optionally switch to short aliases (`u`, `p`, `s`, etc.) for byte savings.
2. **New metadata:** Add `docs`/`d` for documentation and `dep`/`e` for deprecation.
3. **PKA:** Add `pka`/`k` and `kid`/`i` for cryptographic identity.
4. **New protocols:** Use `grpc`, `graphql`, `websocket`, `zeroconf`, or `ucp` tokens.

The `v=aid1` key remains the same — both v1.0 and v1.1 use it.

## Can I use AID in the browser?

**Yes.** Browsers can't make direct DNS queries, but you have two options:

1. **DNS-over-HTTPS (DoH):** Query a DoH resolver (e.g., Cloudflare's `1.1.1.1`, Google's `8.8.8.8`) to resolve the TXT record over HTTPS.
2. **`.well-known` fallback:** Fetch `https://domain.com/.well-known/agent` directly — it's a standard HTTPS request that browsers handle natively.

The `@agentcommunity/aid` SDK handles both strategies automatically in browser environments.

See [Browser Quick Start](../quickstart/quickstart_browser.md) for a working example.

## What's the difference between aid, aid-engine, and aid-doctor?

| Package                      | Purpose                      | Use When                                                         |
| ---------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `@agentcommunity/aid`        | Full SDK (Node.js + Browser) | Building applications that discover agents                       |
| `@agentcommunity/aid-engine` | Pure business logic library  | Embedding discovery in your own tools (no I/O side effects)      |
| `@agentcommunity/aid-doctor` | CLI tool                     | Validating records, generating keys, debugging from the terminal |

**aid** is the main SDK most developers use. **aid-engine** is the stateless core that aid is built on — useful if you need to embed AID logic without the I/O layer. **aid-doctor** is the CLI for operators and DevOps.

See [aid-engine](../Tooling/aid_engine.md) and [aid-doctor](../Tooling/aid_doctor.md) for details.

## More Questions?

- [Specification](../specification.md) — The formal protocol definition
- [Troubleshooting](../Reference/troubleshooting.md) — Common errors and fixes
- [Comparison](comparison.md) — How AID compares to alternative approaches
