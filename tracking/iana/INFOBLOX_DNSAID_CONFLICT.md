# Infoblox DNS-AID vs Agent Community AID — Conflict Record

**Created:** 2026-03-11
**Purpose:** Persistent reference for anyone (human or agent) working on the IANA filing, I-D submission, or DNSOP engagement. Contains all known facts, links, and evidence.

---

## 1. Summary

Infoblox filed three IETF Internet-Drafts for DNS-based agent discovery. They adopted the "AID" acronym (previously "BANDAID") and request IANA registration of `_agent` under RFC 8552 — the same acronym and the same IANA registration that Agent Community's AID specification uses. The published drafts do not reference Agent Community's prior work despite direct, documented knowledge of it.

---

## 2. The Three Infoblox IETF Drafts

| Draft ID | Title | Filed | Expires | Link |
|----------|-------|-------|---------|------|
| `draft-mozley-aidiscovery-00` | AI Agent Discovery (AID) Problem Statement | 2025-10-15 | 2026-04-18 | https://datatracker.ietf.org/doc/draft-mozley-aidiscovery/ |
| `draft-mozleywilliams-dnsop-bandaid-00` | Brokered Agent Network for DNS AI Discovery | 2025-10-16 | 2026-04-19 | https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-bandaid/ |
| `draft-mozleywilliams-dnsop-dnsaid-01` | DNS for AI Discovery | 2026-03-02 | 2026-09-03 | https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/ |

**Authors (all three):** Jim Mozley (Infoblox), Nic Williams (Infoblox), Behcet Sarikaya (Unaffiliated), Roland Schott (Deutsche Telekom)

**Key evolution:** BANDAID renamed to DNS-AID between -00 and -01. The problem statement draft explicitly titles itself "AI Agent Discovery (AID)."

---

## 3. Infoblox Reference Implementation

- **Repo:** https://github.com/infobloxopen/dns-aid-core
- **PyPI package:** `dns-aid`
- **Primary contributor:** Igor Racic (`iracic82`)
- **First commit:** ~January 2026 (based on README timestamps)
- **License:** Apache 2.0
- **Governance target:** Linux Foundation Agent AI Foundation (AAIF)
- **CLI tool:** `dns-aid doctor` (compare: Agent Community's `aid-doctor`)

---

## 4. What Infoblox References vs What They Don't

### In the IETF drafts (-00 and -01):
- **References Agent Community AID spec:** NO
- **References `_agent` TXT record approach:** NO
- **References agent2agent@ September 2025 exchange:** NO
- **References agentcommunity.org:** NO
- **Acknowledgments mention Agent Community:** NO

### In the dns-aid-core README:
- **References Agent Community .agent TLD bid:** YES (in "vs Competing Proposals" comparison table)
- **References Agent Community AID protocol:** NO
- **The README mentions `.agent gTLD` as something that "requires ICANN approval, ongoing domain fees" — this is the TLD application work, NOT the AID protocol specification.**

### Nic Williams' email to Balazs (2026-03-11):
- Claims: "We've referenced you in subsequent versions of the draft, too"
- **This appears to be false.** The -01 (filed March 2, 2026) contains no such reference. The README mentions .agent TLD, not AID.

---

## 5. The Smoking Gun: September 2025 Exchange

### September 4, 2025 — Balazs posts to agent2agent@ietf.org
- Introduced AID (Agent Identity & Discovery)
- Linked aid.agentcommunity.org and docs.agentcommunity.org/aid
- **Archive URL:** https://mailarchive.ietf.org/arch/msg/agent2agent/cxagvsvZsPOU15lRKkN1LIZSfK8/

### September 6, 2025 — Nic Williams replies
- States: "I'm excited you're on this distribution list!"
- States: "I've submitted a BOF request for the upcoming IETF 124 Montreal plenary meeting, and **cited your work** and others to discuss this very concept"
- States: "we have an internet draft about to be published that incorporates some of this work, perhaps a happy coincidence and an opportunity to collaborate"
- Links BOF request: https://datatracker.ietf.org/doc/bofreq-williams-bofreq-mozleywilliams-agent-to-agent-discovery/

### September 6, 2025 — Balazs replies
- Mentions AID received a spec bump that week with signed handshake extension
- Mentions writing to Nic about collaboration

### Timeline implication:
- Nic knew about AID by name on September 6, 2025
- Infoblox filed first I-D on October 15, 2025 (6 weeks later)
- Infoblox renamed BANDAID to "AID"/"DNS-AID" knowing the name was in use
- Published drafts contain zero references to prior AID work

---

## 6. Nic Williams' Direct Admissions (March 11, 2026 email)

Direct quotes from Nic's email to Balazs:

> "We changed the name from BANDAID to AID due to trademark concerns, figured since yours and IETF is open source this wouldn't present issues."

This confirms:
1. The rename was deliberate
2. They were aware of Agent Community's AID before renaming
3. Their justification is "open source" — which governs code licensing, not protocol naming or IANA registrations

> "We've referenced you in subsequent versions of the draft, too."

This appears inaccurate. See Section 4.

---

## 7. IANA Registration Collision

The Infoblox I-D **contains** an IANA registration request in Section 9 but this has NOT been separately filed with IANA. The draft is an individual submission, not WG-adopted, so IANA has not processed it. Their request is currently just text in a draft.

Both specs intend to request the same IANA registrations:

### RFC 8552 — Underscored and Globally Scoped DNS Node Names

| | Agent Community AID | Infoblox DNS-AID |
|---|---|---|
| Requested node name | `_agent` | `_agent` |
| RR Type | TXT | (implied, via I-D Section 9) |
| Reference | AID v1.2 specification | draft-mozleywilliams-dnsop-dnsaid-01 |

**From Infoblox I-D Section 9:** "IANA is requested to register an underscored attribute leaf for AI agents. _agent is suggested."

**Note:** Infoblox's actual DNS label in their spec is `_agents` (plural), but their IANA request says `_agent` (singular) — matching Agent Community's label exactly.

### RFC 6335 — Service Name Registry

Agent Community requests `agent` service name (no port). Infoblox I-D does not explicitly request this but their IANA custom SVCB parameter requests would interact with the same namespace.

---

## 8. Technical Differences (for context, not dispute)

| Aspect | Agent Community AID | Infoblox DNS-AID |
|---|---|---|
| Record type | TXT (SVCB in future v2) | SVCB primary, TXT supplementary |
| DNS label | `_agent.<domain>` (singular) | `_agents.<domain>` (plural) |
| Scope | One record per domain | Multiple agents per domain |
| Philosophy | Minimal, zero-config, any provider | Enterprise-grade, DNSSEC mandatory |
| Security | PKA (Ed25519 via RFC 9421), DNSSEC optional | DNSSEC mandatory, DANE/TLSA |
| Deployability | Any DNS provider today | Requires SVCB support |
| Target user | Individual developer | Enterprise DNS operator |

---

## 9. Key People at Infoblox

| Name | Role | Email | Notes |
|------|------|-------|-------|
| Jim Mozley | Lead author, all three I-Ds | jmozley@infoblox.com | |
| Nic Williams | Co-author, all three I-Ds | nic@infoblox.com | Directly acknowledged AID Sept 2025 |
| Igor Racic | Primary GitHub contributor (dns-aid-core) | GitHub: iracic82 | |

---

## 10. Key External Contacts

| Name | Role | Relevance |
|------|------|-----------|
| Paul Hoffman | IANA/IETF process advisor | Advised waiting until March 14 for I-D + IANA filings |
| Orie Steele | Referred Balazs to Paul Hoffman | |
| Suzanne Woolf | DNSOP WG co-chair | |
| Benno Overeinder | DNSOP WG co-chair | |
| Tim Wicinski | DNSOP WG co-chair | |

---

## 11. Action Status (updated 2026-03-18)

### Complete

| Action | Date | Notes |
|--------|------|-------|
| Reply to Nic (ask about reference) | 2026-03-11 | Nic admitted branch reset lost the reference |
| Email to DNSOP chairs (prior art notice) | 2026-03-11 | Peter Koch replied: IETF consensus determines terminology. Prior art on record. |
| agent2agent@ AID intro + James Cao reply | 2026-03-11 | |
| I-D submitted to Datatracker | 2026-03-16 | https://datatracker.ietf.org/doc/draft-nemethi-aid-agent-identity-discovery/ |
| IANA RFC 8552 `_agent` filed | 2026-03-16 | Ticket #1446511 |
| IANA RFC 6335 `agent` filed | 2026-03-16 | Ticket #1446516 |
| I-D repo public + Pages + tag | 2026-03-16 | |
| Blog post "Why TXT records" published | 2026-03-16 | https://agentcommunity.org/blog/why-txt-records |
| dnsop@ intro email | 2026-03-17 | First agent discovery post on dnsop@. Before DNS-AID's Thu presentation. |
| agent2agent@ Nic+Jim reply (SVCB, model cards, SPF) | 2026-03-17 | |
| Nic private reply (IETF reg, AID/DNS-AID naming) | 2026-03-17 | |
| GitHub issue #113 replied | 2026-03-18 | Blog link + I-D + Section 2.1/5 |
| Behcet reply on agent2agent@ | 2026-03-18 | Asked to defer to WG. Short agreeable reply. |
| Read Paul Hoffman thread + DN-ANR draft | 2026-03-17 | |

### Waiting

| Action | Notes |
|--------|-------|
| IANA expert review responses | Days to weeks |
| Roberto Pioli ARDP interop | Sick for another month. Demo + blog ready. |

### Upcoming

| Action | When |
|--------|------|
| CATALIST BOF (remote, listen) | 2026-03-18 8am GMT+7 |
| DNSOP Session IV (remote, DNS-AID presents) | 2026-03-19 3:30pm GMT+7 |

---

## 12. Links Index

### Agent Community AID
- Spec: https://aid.agentcommunity.org/docs/specification
- Repo: https://github.com/agentcommunity/agent-identity-discovery
- Docs: https://docs.agentcommunity.org/aid
- Registry: https://github.com/agentcommunity/aid-registry
- Token registry: https://github.com/agentcommunity/aid-tokens

### Infoblox DNS-AID
- Repo: https://github.com/infobloxopen/dns-aid-core
- Original personal repo: https://github.com/iracic82/dns-aid-core
- Blog: https://www.infoblox.com/blog/company/agent-discovery-a-foundational-security-issue-for-the-agentic-web/

### IETF
- dnsaid draft: https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/
- bandaid draft: https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-bandaid/
- aidiscovery problem statement: https://datatracker.ietf.org/doc/draft-mozley-aidiscovery/
- BOF request: https://datatracker.ietf.org/doc/bofreq-williams-bofreq-mozleywilliams-agent-to-agent-discovery/
- IETF 124 Dispatch slides: https://datatracker.ietf.org/meeting/124/materials/slides-124-dispatch-ai-agent-discovery-01
- agent2agent mailing list archive: https://mailarchive.ietf.org/arch/browse/agent2agent/
- DNSOP mailing list: https://mailarchive.ietf.org/arch/browse/dnsop/

### Third Competitor: Tsinghua DN-ANR (added 2026-03-16)
- Draft: draft-cui-dns-native-agent-naming-resolution-01
- Author: Yong Cui (Tsinghua University)
- Updated: 2026-03-02
- DNS label: `_agent` (singular) — SAME as ours
- Record types: SVCB + TXT
- IANA request: NONE — does not cite RFC 8552, no registration request in draft
- Datatracker: https://datatracker.ietf.org/doc/draft-cui-dns-native-agent-naming-resolution/
- NOTE: Three drafts now converge on `_agent` — ours (TXT), DNS-AID (requests `_agent` but uses `_agents` in examples), and DN-ANR (uses `_agent` but no IANA request)

### IETF 125 Shenzhen (2026-03-14 to 2026-03-21)
- Agenda: https://datatracker.ietf.org/meeting/125/agenda
- CATALIST BoF: Wed 2026-03-18 8am GMT+7. Balazs registered remote (conf FU7Z85AP).
- **DNSOP Session IV: Thu 2026-03-19 3:30pm GMT+7** — DNS-AID presents (Roland Schott, 10 min). Balazs attending remote.
- Paul Hoffman "Protocol view of agents" thread (March 15): lists 5 protocol categories incl. discovery. Skeptical tone.
- Behcet Sarikaya (DNS-AID co-author) asked to defer technical discussion on agent2agent@ until WG formed (2026-03-18).

### IANA Registry Status (updated 2026-03-24)
- `_agent` in RFC 8552: **OUR APPLICATION PENDING** — ticket #1446511, filed 2026-03-16
- `agent` in RFC 6335: **WITHDRAWAL REQUESTED** 2026-03-24 — ticket #1446516. Port experts flagged "agent" as too generic. Withdrew to resubmit with specific name if v2 SRV design requires it.
- Infoblox has NOT filed any separate IANA request outside their draft
- Our I-D on Datatracker: https://datatracker.ietf.org/doc/draft-nemethi-aid-agent-identity-discovery/
