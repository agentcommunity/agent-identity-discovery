# dnsop@ Introduction Email — DRAFT

**Status:** DRAFT — review before sending
**Target:** Send before Thursday March 19 (DNSOP Session II, DNS-AID presents)
**To:** dnsop@ietf.org
**Subject:** Agent Identity & Discovery (AID) — DNS TXT-based agent service discovery

---

```
Hi all,

We submitted an Internet-Draft for Agent Identity & Discovery
(AID) last weekend:

  https://datatracker.ietf.org/doc/draft-nemethi-aid-agent-identity-discovery/

AID does one thing: given a domain, find the agent endpoint and
figure out which protocol to speak. One TXT record at
_agent.<domain>:

  _agent.example.com. 300 IN TXT "v=aid1;p=mcp;u=https://api.example.com/mcp;a=pat"

Three required keys (v, p, u), a handful of optional ones for
auth hints, documentation, deprecation timestamps, and PKA
(Ed25519 endpoint proof via RFC 9421). After discovery, the
application protocol takes over. AID doesn't do capability
negotiation or runtime behavior.

We went with TXT for v1. We surveyed 31 DNS providers and about
a third of them, including Azure DNS, DigitalOcean, Namecheap,
and the OpenSRS reseller stack, can't publish SVCB ServiceMode
records today. Windows DNS Server can't serve them either. The
full provider-by-provider breakdown is here:

  https://agentcommunity.org/blog/why-txt-records

The _agent label is stable across record types. v1 uses TXT, v2
can move to SVCB or SRV without changing the label. Clients use
the version field (v=aid1) to know what format they're parsing.

The spec has been stable since July 2025 (v1.2, frozen Feb 2026).
SDKs in TypeScript, Python, Go, Rust, .NET, and Java, plus a CLI
validator:

  https://github.com/agentcommunity/agent-identity-discovery

A few design points that might interest this list:

- Exact-host only. Clients query _agent.<exact-host>, no parent-
  domain walking. Inheritance has to be explicit (CNAME).
- Ambiguity rejection. Multiple valid AID records at the same
  name = hard fail, not answer-order selection.
- Unknown keys are ignored. Versioning is explicit. Backward
  compatibility is baked in.

We're aware of draft-mozleywilliams-dnsop-dnsaid (Infoblox, SVCB-
based) and draft-cui-dns-native-agent-naming-resolution (Tsinghua).
Different starting points, but all three converge on _agent as a
DNS label. Comparing the approaches seems useful.

We've also filed IANA requests for _agent under RFC 8552 (TXT)
and "agent" as a service name under RFC 6335 (no port).

Happy to answer questions here or on the draft.

Balazs Nemethi
Agent Community / Open Agent Registry, Inc.
https://agentcommunity.org
```

---

## Sending notes

- Factual, technical, no superlatives or community-size claims.
- Mentioning DNS-AID and Tsinghua by name shows good faith.
- "Different starting points" is neutral, not adversarial.
- Blog link gives SVCB advocates the full data to engage with.
- IANA filing stated as fact, not framed as a land grab.
- Do NOT mention ICANN or .agent gTLD.
- Do NOT mention community size. IETF cares about running code.
- Send from balazs@agentcommunity.org.
- Must be subscribed to dnsop@ first: https://mailman3.ietf.org/mailman3/lists/dnsop.ietf.org/
