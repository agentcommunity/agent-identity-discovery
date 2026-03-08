# NIST NCCoE Comment — Draft

**To:** AI-Identity@nist.gov
**Subject:** Comment on NCCoE Concept Paper — Agent discovery as a prerequisite to agent identity and authorization
**Date:** March 2026

---

Dear Harold, Bill, Ryan, Joshua, and the NCCoE team,

We're writing from the Agent Community, where we maintain the Agent Identity & Discovery (AID) specification. Your concept paper on agent identity and authorization covers the right problems, but we think it's missing a layer: before you can authenticate or authorize an agent, you need to find it.

How does a client, given only a domain name, discover where the agent is, what protocol it speaks, and whether the endpoint actually belongs to that organization? Every standard your paper references (OAuth, SPIFFE, OIDC, MCP, SCIM, NGAC) assumes the answer is already known. Someone registered the OAuth client. Someone enrolled the SPIFFE trust domain. Someone configured the MCP endpoint. AID is the layer that handles the step before all of that.

## What AID does

A provider publishes a DNS TXT record at `_agent.<domain>`:

```
_agent.acme.com. 300 IN TXT "v=aid1;p=mcp;u=https://agent.acme.com/mcp;k=z6MkrTQ...;i=a1;a=oauth2_code"
```

That one record tells a client: the agent lives at this URL, speaks MCP, expects OAuth 2.0 code flow, and here's an Ed25519 public key you can use to verify the endpoint controls the private key. No prior enrollment. No central registry. Just DNS, which organizations already own and manage.

The spec is at v1.2 (finalized February 2026). We have SDKs in TypeScript, Go, Python, Rust, .NET, and Java, plus a CLI validation tool called aid-doctor. The full specification and all code are at:

- Project: https://aid.agentcommunity.org
- Specification: https://aid.agentcommunity.org/docs/specification
- GitHub: https://github.com/agentcommunity/agent-identity-discovery

## How this maps to your questions

**Identification (your Question Area 2).** You ask how agents should be identified and what metadata is essential. AID's answer: anchor identity in DNS, the same way organizations already establish identity for email (SPF/DKIM), web services (TLS), and everything else. The record carries protocol, endpoint URI, auth scheme, docs URL, deprecation timestamp, and an optional public key with a rotation ID. Domain ownership is organizational identity. No new namespace needed.

**Authentication (Question Area 3).** You ask what strong authentication looks like for agents and how to handle key management. AID includes a mechanism called PKA (Public Key for Agent) built on Ed25519 and HTTP Message Signatures (RFC 9421). The flow:

1. Client sends a random nonce as an AID-Challenge header
2. Server signs it with the Ed25519 private key
3. Client verifies against the public key in DNS
4. A 300-second freshness window prevents replay

Key rotation uses the `kid` field. Clients detect downgrade if a previously present PKA disappears. DNSSEC protects the key material in transit. The result: cryptographic proof that the endpoint is controlled by whoever controls that domain's DNS, with no prior trust relationship required.

**Authorization and zero trust (Question Area 4).** AID defines two enterprise policy modes. "Balanced" verifies PKA when present, prefers DNSSEC, allows HTTP fallback, and warns on downgrades. "Strict" requires PKA and DNSSEC, disables fallback, and fails on any downgrade. Beyond that: HTTPS is mandatory for remote agents, cross-origin redirects are blocked, and local execution requires explicit user consent, integrity fingerprinting, and sandboxing. These are the kinds of controls SP 800-207 calls for.

**The cross-boundary problem (Question Areas 4 and 5).** This is the one that motivated much of our recent work. When an enterprise agent crosses organizational boundaries to call partner APIs or external MCP servers, the internal identity infrastructure (SSO, SPIFFE SVIDs, scoped OAuth tokens) is invisible to the receiving party. An SVID from your internal SPIRE deployment means nothing to me.

PKA gives the receiving party something it can actually verify: the calling agent's domain publishes a public key in DNS, and the agent proved it controls the corresponding private key. Think of it as SPF + connection-time DKIM for agents. We're exploring extensions that would let organizational identity travel with requests (PKA-signed JWTs, attestation headers), closer to how full DKIM signatures travel with email. We published a longer analysis here: https://blog.agentcommunity.org/external_identity_anchor

## Where AID sits relative to the standards you listed

AID doesn't replace anything in your paper. It handles the step that comes before all of them.

| Standard | What AID adds |
|----------|---------------|
| MCP | Discovers MCP endpoints and their auth requirements before MCP's OAuth flow starts |
| OAuth 2.0/2.1 | Signals which OAuth flow to use; PKA verifies organizational identity before token exchange |
| SPIFFE/SPIRE | Provides public verification that an organization controls a domain, so you have a reason to accept their SVIDs |
| OIDC | Signals OIDC-based auth; PKA adds an independent identity verification layer |
| SCIM | DNS record is the public-facing identity; could reference lifecycle endpoints |
| NGAC | Organizational origin (verified via AID) is an input to policy decisions |

Or in layered terms:

```
Layer 3: Application authorization  (OAuth 2.1, token exchange, NGAC)
Layer 2: Workload identity          (SPIFFE/SPIRE, WIMSE, internal IdP)
Layer 1: Public identity anchor     (AID, DNS, DNSSEC, TLS, PKA)
```

## Your use cases

For enterprise agents improving workforce efficiency, AID handles zero-configuration discovery of internal and partner services. For security agents, strict mode enforces DNSSEC + PKA before any sensitive data is exchanged. For software development agents, local execution safeguards (consent, integrity checks, sandboxing) are already specified for agents that run code on the client machine.

## What we're suggesting

We think the NCCoE project should include agent discovery and identity bootstrap in its reference architecture. The concept paper jumps from "agents exist" to "here's how we authorize them," but the step in between, finding and verifying the agent, is where a lot of real-world friction lives.

AID is one concrete answer to that problem. It uses infrastructure organizations already have (DNS), works with every protocol your paper mentions, provides cryptographic endpoint proof through existing standards (Ed25519, RFC 9421), and has production implementations ready to test.

If any of this is useful to the project, we're happy to contribute. We can bring implementations into the lab, help with integration guidance, or just talk through what we've run into while building this.

Agent Community
https://agentcommunity.org
https://github.com/agentcommunity

---

*Submitted during the public comment period for "Accelerating the Adoption of Software and AI Agent Identity and Authorization," open through April 2, 2026.*
