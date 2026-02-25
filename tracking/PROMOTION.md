# AID (Agent Identity & Discovery) — Viral Growth Battle Plan

## The One-Line Pitch

> "MX records for AI agents — one DNS TXT record to discover any agent endpoint."

MCP tells agents **how to talk**. A2A tells agents **what to say**. AID tells them **where to find each other**.

---

## PART 1: THE LANDSCAPE (Why Now)

The timing is extraordinary. Here's what's happening:

### The Discovery Gap Everyone Feels But Nobody Has Solved

- **MCP has no native discovery.** The official MCP Registry (Sep 2025) is a centralized API-only metadata catalog. Open issues [#1960](https://github.com/modelcontextprotocol/specification/issues/1960) and [Discussion #1147](https://github.com/modelcontextprotocol/specification/discussions/1147) are actively debating `.well-known/mcp` — but that's HTTP-only and requires a running web server.
- **A2A explicitly acknowledges the gap.** Issue [#378](https://github.com/google/A2A/issues/378) says: "Agent card is nice declarative info about the agent, but it does not solve discovery." Issues [#297](https://github.com/google/A2A/issues/297), [#499](https://github.com/google/A2A/issues/499), and [#641](https://github.com/google/A2A/issues/641) are all attempts to solve this.
- **Every major agent framework lacks discovery.** LangChain, CrewAI, AutoGen, OpenAI Agents SDK, Vercel AI SDK — all require hardcoded URLs.
- **HN commenters keep asking for exactly this.** "Ask HN: Dynamic Tool Discovery" got almost no answers. "API Discovery Layer for Agents" declared "there's no universal discovery layer."

### The Competitors — And Why AID Wins

| Approach | Complexity | DNS-Native | Protocol-Agnostic | Identity | Production Ready |
|----------|-----------|------------|-------------------|----------|-----------------|
| **AID** | 1 TXT record | Yes | Yes (MCP, A2A, OpenAPI, gRPC, GraphQL, WS) | PKA/Ed25519 | Yes (v1.2, 6 SDKs) |
| MCP Registry | API service | No | MCP only | No | Preview |
| A2A Agent Cards | .well-known | No | A2A only | Partial | Yes |
| BANDAID (IETF) | SVCB records | Yes | Yes | DANE/DNSSEC | Draft only |
| ANS/GoDaddy | New PKI system | DNS-inspired | Yes | X.509/PKI | Live (centralized) |
| AgentDNS (IETF) | New root server | DNS-inspired | Yes | Yes | Draft only |
| DN-ANR (IETF) | _agent TXT + SVCB | Yes | Yes | Yes | Draft only |

**AID's killer differentiator: Radical simplicity.** One TXT record. No new infrastructure. No central registry. No running services. Deploy in 30 seconds. Works even when your server is down.

A key HN comment about ANS captures the sentiment perfectly: *"it feels we could achieve something similar with DNS and existing protocols."* That's literally what AID does.

---

## PART 2: THE HACKER NEWS STRATEGY

### Show HN Post — The Flagship

**Timing:** Tuesday–Thursday, 8:00–10:00 AM Pacific (data-backed optimal window)

**Title options (ranked):**
1. Show HN: AID – One DNS TXT record to discover any AI agent (MX records, but for agents)
2. Show HN: We made MX records for AI agents – one DNS query to find any agent endpoint
3. Show HN: AID – DNS-based agent discovery that works with MCP, A2A, OpenAPI, and more

Why these work: HN data shows modest, concrete titles win. The "MX records for agents" analogy is instantly understood by the HN audience. Numbers and specificity ("one DNS TXT record") outperform vague claims.

**Post body strategy:**
- Lead with the problem: "There are 17+ MCP directories, each incomplete. A2A has agent cards but no discovery. Every framework requires hardcoded URLs."
- Show the solution in 3 lines: the DNS record, the query, the result
- Link to live demo at aid.agentcommunity.org (the web workbench)
- Link the GitHub repo
- Explicitly call out: "This is an open standard, not a product. SDKs in 6 languages."

**Critical first-30-minutes playbook:**
- Need 8–10 genuine upvotes and 2–3 thoughtful comments in the first 30 minutes
- Have co-contributors/friends ready to engage with genuine technical comments
- Reply to EVERY comment within 10 minutes — treat critics as allies
- Prepare answers for predictable objections:
  - **"Why not just .well-known?"** → "DNS resolves before HTTP. Works offline, cacheable, no web server needed."
  - **"xkcd competing standards"** → "AID doesn't compete — it's a discovery layer for all the others. It discovers MCP, A2A, OpenAPI endpoints."
  - **"DNS is slow / insecure"** → "DNSSEC, TTL caching (300-900s), and PKA endpoint proof via Ed25519."
  - **"Nobody will adopt this"** → Show the live showcase domains, the 6 SDKs, the CLI tool

### Follow-Up HN Posts (Space These 2-4 Weeks Apart)

1. **"Ask HN: How should AI agents discover each other?"** — Post as a genuine question, engage in discussion, naturally introduce AID as one approach. Don't self-promote; let people ask.
2. **"The Discovery Problem Nobody Is Solving in Agentic AI"** — Write a technical blog post (host on your own domain), submit to HN. Compare all approaches (MCP Registry, A2A Agent Cards, ANS, BANDAID, AID). Be fair and comprehensive. This positions you as a thought leader, not a shill.
3. **"Show HN: aid-doctor – CLI to diagnose any domain's AI agent setup"** — The CLI angle is different from the protocol angle. Devs love CLI tools.
4. **"We made DNS-based agent discovery work across 6 languages — here's what we learned"** — Engineering blog post about the cross-language parity challenge.

---

## PART 3: GITHUB GUERRILLA STRATEGY

This is where you get maximum leverage with minimum effort. Every one of these is a genuine, valuable contribution — not spam.

### Tier 1: CRITICAL (Do These First)

**1. MCP Specification — Discussion #1147 and Issue #1960**
- Where: [Discussion #1147](https://github.com/modelcontextprotocol/specification/discussions/1147) and [Issue #1960](https://github.com/modelcontextprotocol/specification/issues/1960)
- What to say: "We've been working on DNS-based discovery as a complement to .well-known. The idea: query `_agent._mcp.<domain>` to get the MCP server URL before ever hitting HTTP. Here's how it works: [brief explanation]. We have SDKs in 6 languages and a live demo. Happy to discuss how this could complement the `.well-known/mcp` proposal — DNS-first with .well-known as fallback covers both cases."
- Why it works: You're contributing to an active discussion, not opening a random issue. The MCP community is literally asking for this.

**2. A2A Protocol — Issue #378 (Agent Discovery)**
- Where: [Issue #378](https://github.com/google/A2A/issues/378)
- What to say: "The distinction between Agent Cards (capability declaration) and discovery (finding agents in the first place) is exactly right. We've been exploring DNS-based discovery for this — `_agent._a2a.<domain>` TXT records that point to the Agent Card URL. This means you can discover an agent's A2A endpoint without already knowing where to look. Works for local (mDNS) and internet-scale (unicast DNS). Thoughts?"
- Why it works: You're directly addressing the issue's stated problem with a concrete solution.

**3. A2A Protocol — Discussion #741 (Agent Registry)**
- Where: [Discussion #741](https://github.com/google/A2A/discussions/741) (100+ comments, most-discussed need)
- What to say: Present AID as a decentralized alternative to a centralized registry. "What if every domain could publish its agent endpoint in DNS, and any client could discover it without a central registry?"

**4. Awesome-MCP Lists — Submit AID**
- Where:
  - [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) — PR to add AID under a "Discovery" or "Infrastructure" section
  - [wong2/awesome-mcp-servers](https://github.com/wong2/awesome-mcp-servers) — Same
  - [appcypher/awesome-mcp-servers](https://github.com/appcypher/awesome-mcp-servers) — Same
  - [ai-boost/awesome-a2a](https://github.com/ai-boost/awesome-a2a) — PR to add AID as a discovery tool for A2A
- How to frame it: "DNS-based discovery for MCP servers — resolve `_agent._mcp.<domain>` to find endpoints without a centralized registry."

### Tier 2: HIGH PRIORITY (Do Within 2 Weeks)

**5. A2A Protocol — New Issue: "DNS-based Agent Discovery as Complement to Agent Cards"**
- Open a well-written issue proposing DNS-based discovery as a layer below Agent Cards. Reference Issue #378 and the Lad-A2A mDNS discussion. Include a code example showing how `_agent._a2a.example.com` resolves to the Agent Card URL.

**6. MCP Registry — Discussion or Issue**
- Where: [modelcontextprotocol/registry](https://github.com/modelcontextprotocol/registry)
- Proposal: "The registry could crawl AID DNS records as an additional discovery source. Domains that publish `_agent._mcp.<domain>` TXT records could be auto-indexed, similar to how search engines use sitemaps."

**7. OpenAPI Specification — Comment on Discovery Issues**
- Where: [Issue #1851](https://github.com/OAI/OpenAPI-Specification/issues/1851) or [#2540](https://github.com/OAI/OpenAPI-Specification/issues/2540)
- What to say: "This auto-discovery problem has been open since 2017. DNS offers a solution: `_agent._openapi.<domain>` TXT record pointing to the OpenAPI spec URL. This works at the DNS layer (before HTTP), supports multiple API versions, and follows the proven MX-record pattern."

**8. llms.txt — Open a Discussion or Blog Post**
- Where: [AnswerDotAI/llms-txt](https://github.com/AnswerDotAI/llms-txt) (2.1k stars, 844k+ sites adopted)
- Narrative: "llms.txt is for passive content consumption. AID is for active agent interaction. They're complementary: llms.txt says 'here's info about this site,' AID says 'here's where the agent lives.' A domain could publish both."

**9. W3C AI Agent Protocol Community Group**
- Where: [w3.org/community/agentprotocol](https://www.w3.org/community/agentprotocol/)
- Action: Join the community group. Present AID as a candidate protocol that addresses their stated requirement: "Agents must be easily discoverable and accessible by other agents in different network environments, supporting both global internet discovery and local network discovery mechanisms."

**10. Agent Network Protocol (ANP)**
- Where: [agent-network-protocol/AgentNetworkProtocol](https://github.com/agent-network-protocol/AgentNetworkProtocol) (1.2k stars)
- Proposal: AID for discovery, ANP's did:wba for identity. Complementary. "AID's DNS TXT record could include the agent's DID, allowing DNS-based discovery to bootstrap into DID-based identity verification."

### Tier 3: MODERATE (Ongoing Over 4-6 Weeks)

**11. Framework Integration Issues/PRs**

Open issues titled "Add DNS-based agent discovery via AID" in:
- [langchain-ai/langchain](https://github.com/langchain-ai/langchain) — "Enable `AgentExecutor.from_domain('example.com')` using AID DNS resolution"
- [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) — "Allow crews to discover external agents via DNS"
- [vercel/ai](https://github.com/vercel/ai) — "Add `discoverAgent('example.com')` for DNS-based MCP server discovery"
- [openai/openai-agents-python](https://github.com/openai/openai-agents-python) — "Enable `Agent.from_domain()` pattern using DNS discovery"
- [microsoft/agent-framework](https://github.com/microsoft/agent-framework) — "Integrate AID for cross-organizational agent discovery"

For each: Include a working code snippet showing how AID resolves a domain to an agent endpoint. Don't just request a feature — show how it would work.

**12. Smithery.ai Integration**
- Contact Smithery about using AID DNS records as an additional MCP server discovery source. They already use `/.well-known/mcp-config` internally — DNS-first discovery is a natural extension.

**13. IETF Engagement**
- Submit AID as an Internet-Draft. Reference BANDAID, DN-ANR, and the IETF 124 dispatch presentation on DNS agent discovery.
- The BANDAID draft's philosophy aligns with AID's (no DNS protocol changes, use existing record types). Engage with those authors.

---

## PART 4: CONTENT & MEDIA STRATEGY

### Blog Posts (Publish on Your Domain, Cross-Post to Dev.to/Medium)

1. **"The Agent Discovery Problem: Why AI Agents Can't Find Each Other"**
   - Problem-focused. Compare all approaches. Be the objective authority.
   - End with: "We built AID to solve this. Here's how it works."

2. **"DNS: The Original Decentralized Registry (And Why AI Agents Should Use It)"**
   - Historical angle. MX records, SRV records, DKIM — DNS has always been the internet's service discovery layer. Why reinvent it for agents?

3. **"From MX to _agent: How One TXT Record Replaces a Whole Agent Registry"**
   - Tutorial-style. Walk through setting up AID for a domain in 60 seconds.

4. **"We Built the Same SDK in 6 Languages — Here's What We Learned About Protocol Parity"**
   - Engineering story. The code-gen-from-YAML approach is genuinely interesting.

5. **"PKA: How Ed25519 Signatures Prove Your Agent Is Real"**
   - Security deep-dive. Explain the cryptographic handshake. This appeals to the crypto/security crowd on HN.

### Newsletter/Podcast Outreach

**Top Priority:**
- **Latent Space** (swyx + Alessio) — 170k+ daily readers, THE AI engineering audience. Pitch: "We're building the DNS layer for agent discovery — the infrastructure piece everyone keeps saying is missing." swyx specifically covers protocols and standards.

**Secondary:**
- **TLDR AI** — Submit as a project for their daily digest
- **Matthew Berman / Forward Future** — YouTube channel that interviewed Satya Nadella about MCP. Reach out about AID as "the missing piece of MCP."
- **High Agency** (Raza Habib) — Podcast for AI developers
- **Mixture of Experts** (IBM) — Covers standards and protocols

### Reddit Strategy

**Primary targets:**
- **r/AI_Agents** (296k members) — Post: "We built DNS-based discovery for AI agents. Here's the open standard."
- **r/AgenticAI** — Smaller but highly engaged. Focus on the technical angle.
- **r/LocalLLaMA** — The local protocol support (`docker:`, `npx:`, `pip:`) + zeroconf (mDNS) appeals to this audience.

Approach: Don't just drop a link. Write a genuine post explaining the problem, your approach, and ask for feedback. Reddit rewards authenticity.

### Twitter/X Strategy

**Key threads to write:**
1. **"The agent discovery problem in one image"** — Create a diagram showing: MCP (how to talk) + A2A (what to say) + ??? (where to find) = AID fills the gap
2. **"Every agent framework has this same problem"** — Screenshot of hardcoded URLs in LangChain, CrewAI, Vercel, etc. → "What if this was just `_agent.example.com`?"
3. **"Set up agent discovery in 30 seconds"** — Screen recording of adding a DNS TXT record and running `aid-doctor check <domain>`
4. **"MX records for agents"** — The one-liner that sticks. Tag @swyx, @AnthropicAI, @GoogleAI when contextually relevant (not spam).

**People to engage with:**
- David Soria Parra & Justin Spahr-Summers (MCP creators)
- swyx (Latent Space, covers protocols)
- Simon Willison (covers agent infrastructure)
- Harrison Chase (LangChain)
- The A2A maintainers

---

## PART 5: TECHNICAL CREDIBILITY PLAYS

**1. Submit an IETF Internet-Draft**
- This is the single biggest credibility move. Having `draft-<yourname>-aid-00` on the IETF datatracker puts you alongside BANDAID, ANS, and DN-ANR.
- Reference RFC 6763 (DNS-SD), RFC 9421 (HTTP Message Signatures), and the existing IETF drafts.
- The IETF 124 dispatch session on "AI Agent Discovery Using DNS" shows there's already interest.

**2. Request IANA `_agent` Service Name Registration**
- Your spec already mentions this as future work. Filing the IANA request adds legitimacy.

**3. Publish Security Analysis**
- Write up AID's security model: PKA handshake, DNSSEC, redirect protection, local execution safeguards.
- Compare to ANS's X.509/PKI approach. AID's Ed25519 is lighter and doesn't require a centralized CA.
- Post to r/netsec or HN.

**4. Benchmark Against Alternatives**
- Show DNS resolution time vs HTTP `.well-known` fetch time
- Show record size efficiency (TXT with key aliases vs JSON Agent Cards)
- Publish results in a blog post

---

## PART 6: CREATIVE / GUERRILLA TACTICS

**1. "The AID Challenge"**
- Challenge prominent domains to set up AID records. "Can we get 100 domains with `_agent` records in 30 days?"
- Create a leaderboard on the web workbench showing domains with live AID records.
- This is gamification + social proof.

**2. AID Records for Famous Domains (Showcase)**
- Set up AID records for your own demo domains that point to popular MCP servers, A2A agents, and OpenAPI specs.
- When people run `aid-doctor check <domain>`, they see it work immediately.
- Expand the e2e-tests/showcase to include diverse examples.

**3. Build a "Discover" Feature for Claude Desktop / Cursor**
- Build an MCP server that wraps AID — users type a domain, it resolves the agent endpoint and connects.
- Submit to the MCP server marketplaces (Smithery, mcp.so, etc.).
- This is dog-fooding: an MCP server that discovers other MCP servers via DNS.

**4. Integration with Claude Code**
- Build a `/discover example.com` slash command for Claude Code that uses AID to find and connect to agents.
- This would be extremely meta and viral within the Claude ecosystem.

**5. "AID vs. The World" Comparison Page**
- A single webpage comparing AID to every alternative: MCP Registry, A2A Agent Cards, ANS/GoDaddy, BANDAID, AgentDNS, DN-ANR, ACDP.
- Be honest and fair. Show where AID wins (simplicity, DNS-native, protocol-agnostic) and where others have strengths (enterprise governance, IETF backing).
- This becomes the canonical resource people link to when discussing agent discovery.

**6. Moltbook Presence**
- Moltbook is "Reddit for AI agents" — 150k+ agents joined in 3 days. Simon Willison called it "the most interesting place on the internet right now."
- Register AID as an agent on Moltbook. Have it demonstrate domain-based discovery in real-time.

**7. "Fix the xkcd Problem" Narrative**
- The #1 objection will be "great, another competing standard (xkcd 927)."
- Pre-empt this with a clear counter-narrative: "AID is not a competing standard. It's a discovery layer FOR existing standards. It doesn't replace MCP, A2A, or OpenAPI — it helps you find them. You still need MX records even if you use Gmail."

---

## PART 7: EXECUTION TIMELINE

### Week 1: Foundation
- [ ] Polish the Show HN post draft
- [ ] Comment on MCP Discussion #1147 and Issue #1960
- [ ] Comment on A2A Issue #378 and Discussion #741
- [ ] Submit PRs to awesome-mcp lists (punkpeye, wong2, appcypher, ai-boost/awesome-a2a)
- [ ] Write blog post #1: "The Agent Discovery Problem"

### Week 2: Launch
- [ ] Publish Show HN (Tue–Thu, 8–10 AM Pacific)
- [ ] Post to r/AI_Agents and r/AgenticAI
- [ ] Pitch Latent Space newsletter
- [ ] Comment on OpenAPI discovery issues (#1851, #2540)
- [ ] Open issue/discussion on llms.txt repo

### Week 3: Expand
- [ ] Write blog post #2: "DNS: The Original Decentralized Registry"
- [ ] Open integration issues on LangChain, CrewAI, Vercel AI SDK
- [ ] Join W3C AI Agent Protocol CG
- [ ] Engage with ANP team about complementary standards
- [ ] Contact Smithery.ai about DNS-based crawling

### Week 4: Credibility
- [ ] Begin IETF Internet-Draft
- [ ] Publish security analysis blog post
- [ ] Build the AID MCP server (discover other MCP servers via DNS)
- [ ] Open issues on OpenAI Agents SDK, Microsoft Agent Framework
- [ ] Post follow-up Ask HN: "How should AI agents discover each other?"

### Weeks 5-8: Sustain
- [ ] Submit IETF draft
- [ ] Write engineering blog posts (#3, #4, #5)
- [ ] Launch "The AID Challenge" (100 domains in 30 days)
- [ ] Build comparison page
- [ ] Post Show HN for aid-doctor CLI
- [ ] Continue engaging in GitHub discussions as they evolve

---

## PART 8: KEY URLS & REFERENCES

### Places to Engage (Direct Links)

| Target | URL | Action |
|--------|-----|--------|
| MCP .well-known Discussion | [#1147](https://github.com/modelcontextprotocol/specification/discussions/1147) | Comment with DNS-first approach |
| MCP .well-known/mcp SEP | [#1960](https://github.com/modelcontextprotocol/specification/issues/1960) | Propose DNS as complement |
| A2A Agent Discovery | [#378](https://github.com/google/A2A/issues/378) | Show DNS solves their stated gap |
| A2A Registry Discussion | [#741](https://github.com/google/A2A/discussions/741) | Present decentralized alternative |
| A2A Mesh Discovery | [#499](https://github.com/google/A2A/issues/499) | DNS-SD for mesh |
| A2A Multi-Agent Discovery | [#641](https://github.com/google/A2A/issues/641) | AID as discovery layer |
| OpenAPI Auto-Discovery | [#1851](https://github.com/OAI/OpenAPI-Specification/issues/1851) | DNS-based spec discovery |
| OpenAPI Well-Known URL | [#2540](https://github.com/OAI/OpenAPI-Specification/issues/2540) | Same |
| awesome-mcp-servers (punkpeye) | [GitHub](https://github.com/punkpeye/awesome-mcp-servers) | Submit PR |
| awesome-mcp-servers (wong2) | [GitHub](https://github.com/wong2/awesome-mcp-servers) | Submit PR |
| awesome-a2a | [GitHub](https://github.com/ai-boost/awesome-a2a) | Submit PR |
| llms.txt | [GitHub](https://github.com/AnswerDotAI/llms-txt) | Open complementary discussion |
| W3C Agent Protocol CG | [W3C](https://www.w3.org/community/agentprotocol/) | Join and present |
| ANP / did:wba | [GitHub](https://github.com/agent-network-protocol/AgentNetworkProtocol) | Propose complementary integration |
| MCP Registry | [GitHub](https://github.com/modelcontextprotocol/registry) | Propose DNS-based crawling |

### IETF Drafts to Reference/Engage
- **BANDAID** — Closest philosophical alignment
- **DN-ANR** — Also uses `_agent` prefix
- **ANS** — More complex, centralized
- **IETF 124 Dispatch Slides on DNS Agent Discovery** — Validates the approach

### Competitors to Monitor
- **GoDaddy ANS Registry** — Live, commercial, centralized
- **Smithery.ai** — Largest MCP marketplace, uses `.well-known/mcp-config`
- **NIST AI Agent Standards Initiative** — US government signaling this matters

---

## TL;DR — The Top 10 Highest-ROI Actions

1. **Comment on MCP Discussion #1147 and Issue #1960** — The MCP community is literally asking for what AID provides
2. **Comment on A2A Issue #378** — A2A acknowledges discovery is unsolved; AID solves it
3. **Submit PRs to awesome-mcp lists** — Instant developer visibility
4. **Post Show HN** (Tue-Thu 8-10 AM Pacific) — Title: "AID – One DNS TXT record to discover any AI agent (MX records, but for agents)"
5. **Write "The Agent Discovery Problem" blog post** — Position as thought leader
6. **Pitch Latent Space** (swyx's newsletter) — 170k+ AI engineers
7. **Comment on A2A Discussion #741** — 100+ comments, highest-engagement thread
8. **Join W3C AI Agent Protocol CG** — Standards credibility
9. **Build an MCP server that discovers other MCP servers via AID** — Dog-food the protocol, submit to marketplaces
10. **Begin IETF Internet-Draft** — The ultimate credibility play

---

**The core narrative everywhere: "AID doesn't compete with MCP — it completes it."**
