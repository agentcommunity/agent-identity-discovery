# MCP Outreach Drafts

## 1. Comment for PR #2127 (SEP-2127: MCP Server Cards)

**Where to post:** https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127

**Tone:** Constructive contributor, not salesperson. Address their stated concerns directly.

---

### Draft Comment

Great work on the Server Card spec — the pre-connection metadata surface is exactly what's been missing.

I want to address the DNS consideration that was dismissed in the current draft:

> "We considered using DNS TXT records for discovery, similar to DKIM or SPF. However, this approach would be limited to domain-level discovery and wouldn't work for path-based or port-based MCP servers, making it too restrictive."

This isn't quite accurate. A DNS TXT record at `_agent.<domain>` doesn't encode the endpoint *in* the DNS record structure itself — it contains a **URL pointer** as a value field, which can include arbitrary paths and ports:

```
_agent.example.com. 300 IN TXT "v=aid1; p=mcp; u=https://api.example.com:8443/v2/mcp"
```

The DNS record is a *locator*, not the metadata. It answers "does this domain have an MCP server, and where?" — then `.well-known/mcp/server-card` answers "what can it do?". These are complementary layers, not competing ones.

**Why this matters concretely — the managed hosting gap:**

@qui-sam raised an important unresolved concern: businesses on Wix, Squarespace, WordPress.com, and similar managed platforms **cannot serve `.well-known` paths** because they don't control routing. That's a real adoption barrier.

But these same businesses almost always retain full control of their DNS records. A TXT record at `_agent.example.com` pointing to their MCP server (hosted elsewhere) works regardless of who hosts the website. This is exactly how DKIM, SPF, and domain verification already work — your email provider doesn't need to be your web host.

**The two-layer model:**

| Layer | Mechanism | Answers | Works when |
|-------|-----------|---------|------------|
| Discovery | DNS TXT at `_agent.<domain>` | "Where is the agent?" | Always (even if web host doesn't support `.well-known`) |
| Metadata | `.well-known/mcp/server-card` | "What can it do?" | When you control the HTTP server |

DNS-first, `.well-known` as enrichment. Clients that find a DNS record can go straight to the endpoint; clients that also want the full Server Card can fetch it via `.well-known` or as an MCP resource post-connection.

**Existing work:**

We've implemented this pattern in [AID (Agent Identity & Discovery)](https://github.com/agentcommunity/agent-identity-discovery) with SDKs in 6 languages (TS, Go, Python, Rust, .NET, Java), a CLI diagnostic tool, and a live web workbench. The spec also includes PKA (Public Key Attestation) via Ed25519/RFC 9421 for endpoint proof — which addresses the server identity verification gap discussed in [registry#406](https://github.com/modelcontextprotocol/registry/issues/406).

I'm not proposing replacing Server Cards — they're valuable for rich metadata. I'm suggesting the spec acknowledge DNS as a complementary discovery layer and define how `_agent.<domain>` TXT records can point to Server Card URLs. This gives MCP two discovery paths instead of one, covering the managed hosting case and enabling discovery before any HTTP request.

Happy to collaborate on spec language if there's interest.

---

## 2. Comment for MCP Registry — Connecting #406 to #2127

**Where to post:** https://github.com/modelcontextprotocol/registry/issues/406 (your own issue — add a follow-up comment)

**Purpose:** Bridge your existing issue to the active PR #2127, show momentum.

---

### Draft Comment

Following up on this now that SEP-2127 (MCP Server Cards / `.well-known` discovery) is actively being drafted in [modelcontextprotocol/modelcontextprotocol#2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127).

The Server Card spec currently dismisses DNS-based discovery with the rationale that "DNS TXT records would be limited to domain-level discovery and wouldn't work for path-based or port-based MCP servers." But as described in this issue, the AID TXT record contains a URL field (`u=`) that supports arbitrary paths and ports — DNS is the locator, not the metadata.

What's interesting is that SEP-2127 has an unresolved gap that DNS directly solves: @qui-sam [pointed out](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127) that businesses on managed hosting platforms (Wix, Squarespace, WordPress.com) **cannot serve `.well-known` paths**. These same businesses retain full DNS control. This is the exact same pattern as DKIM/SPF — your email infrastructure doesn't need to live on your web host.

The trust model proposed here (AID DNS record + Ed25519 handshake) naturally layers on top of Server Cards:

1. **DNS discovery** → "This domain has an MCP server at `https://api.example.com/mcp`"
2. **PKA handshake** → "The server controls the private key published in DNS"
3. **Server Card** → "Here's what the server can do" (fetched from `.well-known` or post-connection)

The registry could use step 1+2 as an additional verification source — any domain with a valid `_agent` TXT record and passing PKA handshake has cryptographically proven they control both the domain and the endpoint. That's stronger than one-time OAuth verification.

I've left a more detailed comment on PR #2127 about the DNS complementarity. @domdomegg — the "newness" concern is fair, but the underlying primitives (DNS TXT, Ed25519, RFC 9421 HTTP Message Signatures) are all battle-tested. The AID surface is intentionally small: one record format, one handshake. There's also now an [IETF BoF on DNS-anchored agent discovery](https://datatracker.ietf.org/doc/bofreq-williams-bofreq-mozleywilliams-agent-to-agent-discovery/) on the agenda, which signals the broader standards community sees this gap too.

---

## 3. New Discussion/Comment on MCP Specification Discussions

**Where to post:** https://github.com/modelcontextprotocol/modelcontextprotocol/discussions/1147 (the original .well-known discussion)

**Purpose:** Connect the original discussion to the active PR and surface DNS as the missing layer.

---

### Draft Comment

Now that this has materialized as SEP-2127 ([PR #2127](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127)), I want to revisit a point @McSpidey raised earlier in this thread about DNS TXT records.

The Server Card spec explicitly considered DNS and dismissed it as "limited to domain-level discovery." But the pattern we've been working on — `_agent.<domain>` TXT records — stores a full URL as a value field, so paths and ports work fine:

```
_agent.example.com. 300 IN TXT "v=aid1; p=mcp; u=https://api.example.com:8443/v2/mcp"
```

The practical gap this fills: `.well-known` requires HTTP server control. DNS doesn't. That matters for the millions of businesses on managed platforms who can edit DNS but can't place files at arbitrary HTTP paths.

DNS-first, Server Cards as enrichment. Not either/or.

I've posted a more detailed comment on PR #2127 with specifics.

---

## 4. Strategy: Where to Post and In What Order

### Sequence (do this over 2-3 days, not all at once)

**Day 1:**
1. **PR #2127** — Post the main comment (Draft #1 above). This is the most important one. The PR is in active draft status with ongoing discussion. Your comment directly addresses a stated rejection rationale and an unresolved objection.

**Day 2:**
2. **Registry #406** — Post the follow-up comment (Draft #2 above) on your own issue. This bridges the registry trust discussion to the active spec work and shows you're tracking the ecosystem.
3. **Discussion #1147** — Post the shorter comment (Draft #3 above) to connect the original discussion to the PR and give visibility to people following #1147 who may not be watching #2127.

**Day 3-5 (optional, gauge reception first):**
4. **New discussion or issue** on `modelcontextprotocol/modelcontextprotocol` — "DNS as a complementary discovery layer for MCP Server Cards" — only if the PR #2127 comment gets positive engagement. This would be a more formal write-up proposing specific spec language for DNS discovery alongside `.well-known`.

### Key Messaging Rules

- **Never say "AID vs Server Cards"** — always "AID + Server Cards"
- **Lead with their problems**, not your solution (managed hosting gap, DNS rejection rationale)
- **Be specific**: show the TXT record, show the URL field, show paths and ports work
- **Reference existing participants**: @qui-sam's concern, @McSpidey's earlier DNS proposal, @Fannon's call for broader discovery, @hyperpolymath's DNS issues that were closed for process reasons
- **Don't over-link**: one link to the AID repo is enough. Let the argument stand on its own.

### What NOT to Do

- Don't post on all three on the same day — it looks coordinated/spammy
- Don't open a new issue on the spec repo yet — contribute to the existing PR first
- Don't mention the registry can "crawl DNS records" — that comes later after trust is established
- Don't push PKA/Ed25519 too hard in the Server Card PR — focus on discovery first, identity second
