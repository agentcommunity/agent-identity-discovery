# AID v2.0 vs. ARD — Scope, Fit, and Collision Analysis

**Date:** 2026-06-20
**Author:** Agent Community
**Status:** Internal analysis / positioning note (non-normative)

## TL;DR

ARD does **not** conflict with AID's plans. They sit on **adjacent layers** and answer
**different questions**, so AID's narrow niche survives ARD intact:

- **ARD** answers _"I have a task — which capabilities exist across the web, and which should I use?"_
  It is **search + catalog** (1 → N, probabilistic, registry-backed).
- **AID** answers _"For **this** domain, where is the agent and how do I speak to it — and can the
  live endpoint prove it?"_ It is **resolution + endpoint proof** (1 → 1, deterministic, DNS-native).

The user's instinct — _"it fits as the step right before"_ — is essentially correct, with one
refinement: AID is the deterministic resolution/proof step that sits **between** ARD's search step
and the runtime invocation (MCP/A2A) step. For a known single-agent domain you skip ARD entirely
and go AID → MCP.

The one thing genuinely worth watching is a **DNS namespace land-grab**, not a functional conflict:
ARD stakes the **`_agents`** (plural) SVCB label space; AID owns **`_agent`** (singular) TXT. They
do not collide as DNS records, but they are one character apart and both are "agent discovery in
DNS." That proximity is the only strategic risk, and it's a naming/mindshare risk, not a technical one.

---

## What ARD actually is

Source: Google Developers Blog announcement (Jun 2026), the spec repo
[`github.com/ards-project/ard-spec`](https://github.com/ards-project/ard-spec) (`spec/ard.md`,
v0.9 draft), and [agenticresourcediscovery.org](https://agenticresourcediscovery.org/).
Apache-2.0; builds on the Linux Foundation **AI Catalog** data model. Authored by Google with
industry partners; Google Cloud ships a hosted implementation ("Agent Registry").

ARD is _"a federated, domain-anchored standard for cataloging, searching, and discovering agentic
resources (MCP servers, A2A agent cards, Skills, APIs, and other callable services) across networks
of discovery services."_ It explicitly operates **entirely before invocation** and is **not an
execution runtime** — it does not replace MCP, A2A, Skills, or API runtimes.

### Two primitives

1. **Catalogs** — a static JSON manifest a publisher hosts at
   **`https://{domain}/.well-known/ai-catalog.json`** listing the capabilities it offers.
2. **Registries** — dynamic, searchable services that crawl/ingest catalogs across the web, index
   them, and expose a REST query API (`POST /search`, optional `POST /explore`, `GET /agents`).
   These are the "search engines for agents"; enterprises run their own.

### Catalog entry (envelope) shape

```json
{
  "identifier": "urn:air:acme.com:server:weather",      // URN: urn:air:<publisher>:<namespace>:<name>
  "displayName": "Weather Data Node",
  "type": "application/mcp-server-card+json",            // IANA media type → delegates schema to MCP/A2A
  "url": "https://api.acme.com/mcp/weather.json",        // (or inline `data`) the actual artifact
  "capabilities": ["WeatherTool", "ForecastTool"],
  "trustManifest": { "identity": "<SPIFFE ID or DID>", "attestations": [/* SOC2, GDPR, ... */] }
}
```

Key design choices: **artifact-agnostic envelope** (ARD never defines the MCP/A2A schema — it points
at it via IANA media type + `url`/`data`), **search-first** (designed to scale to many capabilities,
beyond a model's context window), and **strict value-or-reference** (exactly one of `url`/`data`).

### How ARD identity/trust works

ARD verifies the **publisher**, not the live wire endpoint. The URN embeds the authority domain
(`urn:air:acme.com:...`); a registry/orchestrator extracts that domain and cross-references it
against `trustManifest.identity` (a **SPIFFE ID or DID**) whose cryptographic trust-domain root MUST
align with the URN's authority domain, plus `attestations` for compliance claims. Runtime
**authentication is explicitly delegated** to the artifact protocol — ARD does not do it.

### ARD discovery mechanisms (Section 6.1)

Required baseline is web-based; DNS is optional:

1. **Well-Known URI** — `https://{domain}/.well-known/ai-catalog.json`
2. **robots.txt** — `Agentmap: https://example.com/catalog.json`
3. **HTML** — `<link rel="ai-catalog" href="...">`
4. **DNS Service Binding (SVCB) records** — `_catalog._agents.example.com` (→ static manifest) and
   `_search._agents.example.com` (→ dynamic registry search endpoint)

---

## Side-by-side

| Dimension | **AID v2.0** | **ARD v0.9** |
| --- | --- | --- |
| Question answered | "Where is **this domain's** agent + which protocol?" | "Which capabilities exist for **this task**, across the web?" |
| Cardinality | 1 domain → **1** canonical record/endpoint | task → **N** candidate capabilities (search results) |
| Determinism | Deterministic lookup (ambiguity = error) | Probabilistic / semantic search + ranking |
| Primary transport | **DNS TXT** at `_agent.<domain>` (singular) | **HTTPS** `/.well-known/ai-catalog.json`; DNS SVCB `_agents` (plural) optional |
| Payload | ~1 TXT record, `key=value`, < 255 bytes | JSON catalog (many entries) + registry REST API |
| Indexing/search | None (point lookup) | Core feature (registries crawl + index + query) |
| Identity proof | **PKA**: live **endpoint** proves control of DNS-published Ed25519 key (RFC 9421) | **trustManifest**: **publisher** identity via SPIFFE/DID aligned to URN domain |
| What it proves | The endpoint you reach is the one the domain's DNS vouches for **right now** | The catalog entry was published under that domain's authority |
| Well-known file | `/.well-known/agent` (single-record mirror, DNS fallback only) | `/.well-known/ai-catalog.json` (the primary catalog, a list) |
| Auth / capability negotiation | Out of scope (hands off to MCP/A2A/OAuth) | Out of scope (delegated to artifact protocol) |
| Governance | Agent Community | Google + partners, Linux Foundation AI Catalog WG, Apache-2.0 |
| Maturity | v2.0 current normative | v0.9 draft |

The two specs even share the same philosophy of **minimalism + delegation** — both refuse to define
auth or the runtime artifact schema. They draw the discovery/invocation boundary in the same place;
they just cover different spans of the "discovery" half.

---

## How they compose (the layered stack)

```
TASK
  │
  │  ARD: "find candidate capabilities for this task"
  │  (registry search → catalog entries with URN + media type + url)
  ▼
CANDIDATE DOMAIN(S) / CAPABILITY
  │
  │  AID: "resolve THIS domain to its canonical live endpoint + prove it"
  │  (_agent.<domain> TXT → uri + proto + PKA endpoint proof)
  ▼
VERIFIED ENDPOINT + PROTOCOL
  │
  │  MCP / A2A / OpenAPI: invoke
  ▼
RUNTIME
```

Two real, non-overlapping fit points make AID **complementary**, not redundant:

1. **AID supplies endpoint proof that ARD structurally lacks.** ARD's `trustManifest` proves
   _"acme.com published this catalog entry"_ (publisher identity). It says nothing about whether the
   live host you ultimately TLS-connect to is the one acme.com's DNS currently vouches for. AID's PKA
   proves exactly that — _"the endpoint at this URI controls the Ed25519 key published in acme.com's
   DNS right now."_ Publisher-attestation (ARD) and live-endpoint-proof (AID) are different guarantees;
   a security-conscious flow wants both.

2. **AID is the deterministic floor; ARD is the searchable ceiling.** A domain with **one** canonical
   agent only needs an AID TXT record — no catalog, no registry, no crawl. A domain offering **many**
   capabilities that should be _findable by task_ publishes an `ai-catalog.json`. The two are not
   mutually exclusive: a domain can do both, and the AID record can be the deterministic bootstrap
   that an ARD catalog entry's `url` points into.

So ARD does **not** make AID redundant: ARD already carries an endpoint `url` in each catalog entry,
but it carries it as a **publisher claim**, not a DNS-rooted, proof-carrying resolution. That gap is
AID's lane.

---

## Where it could "fuck with" AID — honest risks

### 1. DNS namespace proximity: `_agent` vs `_agents` (the one to watch)

- AID: **`_agent.<domain>`** — singular, **TXT**.
- ARD: **`_agents.<domain>`** — plural, **SVCB** (`_catalog._agents`, `_search._agents`).

These are **different DNS owner names and different RR types**, so there is **no literal record
collision** and no resolver-level ambiguity. The risk is purely human/strategic:

- Google is staking **`_agents`** as _the_ DNS prefix for "agent discovery." AID has spent its
  reputation on **`_agent`**. One character apart, same conceptual space → operator confusion,
  documentation collisions, and a mindshare contest AID could lose by default to a Google + Linux
  Foundation effort.
- Mitigation/opportunity: lean into the distinction publicly. AID = "the **singular** canonical agent
  for a domain, with cryptographic endpoint proof." ARD = "the **plural** searchable catalog." The
  plural/singular split is actually a clean, defensible story. Worth coordinating directly with the
  ards-project so the two labels are documented as **complementary**, not competing (Agent Community
  could file an interop note / issue upstream).

### 2. Mindshare / default-path risk

If ARD's optional DNS SVCB mode (`_catalog._agents` / `_search._agents`) becomes the reflexive answer
to "how do I find an agent for a domain," AID's narrow point-lookup niche could get crowded out by
gravity, regardless of technical merit. Counter: ARD's DNS mode resolves to a **catalog or a search
endpoint** (still 1 → N, still needs a crawl/index round-trip), never to a single proof-carrying
endpoint. AID's deterministic, zero-infrastructure, PKA-backed 1 → 1 bootstrap is a different product.
Keep hammering the two differentiators ARD cannot match at the DNS layer: **determinism** and
**endpoint proof**.

### 3. Well-known file overlap (non-issue)

`/.well-known/agent` (AID, single-record fallback) vs `/.well-known/ai-catalog.json` (ARD, primary
catalog). Different filenames, different shapes, no collision. Note only that an ARD-first world makes
`ai-catalog.json` the better-known artifact; AID's well-known remains a DNS fallback, not a competitor.

---

## Recommendation

1. **Treat ARD as a composition partner, not a competitor.** Add an **Appendix D composition note**
   to `packages/docs/specification.md` (alongside the existing Web Bot Auth / auth.md / SPIFFE / Pkarr
   notes) describing the ARD relationship: AID is deterministic per-domain resolution + endpoint proof;
   ARD is cross-web search/catalog; an ARD catalog entry's endpoint can be AID-resolved and PKA-proven.
   _(That edit touches `packages/docs/**` → run `pnpm docs:verify` and commit the regenerated
   `export-manifest.json` + `.sha256`.)_

2. **Own the `_agent` (singular) vs `_agents` (plural) distinction explicitly** in docs and messaging,
   and open an interop dialogue with the ards-project so the labels are jointly documented as adjacent
   layers. This is the single most leverage-positive action.

3. **Lead with the two things ARD's DNS layer cannot do:** deterministic 1 → 1 resolution and
   live-endpoint PKA proof. That is AID's durable moat regardless of ARD's adoption curve.

4. **No spec change is forced by ARD.** AID v2.0's scope statement ("AID is an intentionally minimal
   discovery layer … richer protocols take over") already accommodates an ARD layer above it. Nothing
   in ARD invalidates AID's design; the work is positioning + an interop note, not a redesign.

---

## Sources

- Google Developers Blog — _Announcing the Agentic Resource Discovery specification_:
  https://developers.googleblog.com/announcing-the-agentic-resource-discovery-specification/
- ARD spec repo: https://github.com/ards-project/ard-spec (`spec/ard.md`, v0.9 draft)
- ARD site: https://agenticresourcediscovery.org/
- AID v2.0: `packages/docs/specification.md` (this repo)
