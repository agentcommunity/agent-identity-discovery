---
title: 'AID v2 Design Notes'
description: 'Historical design notes for the AID v2 specification'
icon: material/file-document-edit-outline

extra_css_class: aid-page

tags:
  - v2
  - design-notes
  - '2026-05-23'
  - superseded
---

# Agent Identity & Discovery (AID) v2 - Design Notes

_Historical notes from the v2 specification work_

**Date:** 23 May 2026 (frozen; superseded by specification.md as of 2026-06-14, which added the domain-binding profile)
**Editor:** Agent Community
**Status:** Historical design notes — superseded

> **This page is a historical draft and has been superseded.**
> The authoritative, normative protocol is the **[AID v2 Specification](specification.md)**. Read that document for all implementation decisions, wire-format rules, security requirements, and domain-binding (Appendix B.7) details. This page is retained only as design history and review context for the legacy `aid1` to v2 transition. Where this page conflicts with `specification.md`, the specification takes precedence.

> The current normative protocol is the [AID v2 specification](specification.md). This page is retained as design history and review context for the legacy `aid1` to v2 transition.

## Background Reading

Two earlier Agent Community posts are useful background, but the v2 specification is the implementation authority:

- [PKA as External Trust Anchor](https://agentcommunity.org/blog/external_identity_anchor) explains the first-contact identity problem PKA addresses. It was written for the legacy `aid1` wire format, so use it for the trust model, not for current header, key, or `keyid` details.
- [Why AID ships on TXT records](https://agentcommunity.org/blog/why-txt-records) explains the deployment rationale for using TXT as the mandatory baseline. AID v2 keeps that TXT baseline for the 0-th hop while leaving richer service-binding records to future profiles or adjacent discovery systems.

---

## How To Read This Page

This page has two layers:

- **Historical specification text** uses normal normative language such as MUST, SHOULD, and MAY because it was written during the v2 review.
- **Explainer notes** explain the reason for a design choice and how it differs from legacy `aid1`.

The proposal is intentionally narrow:

> AID is the first-contact endpoint-and-key anchor: DNS publishes the current endpoint and the current Ed25519 public key; rotation, attestation, request provenance, workload identity, and authorization compose above it.

---

## What Changes From Legacy `aid1`

| Area                   | Legacy `aid1`                        | v2                                       | Why                                                                                     |
| ---------------------- | ------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| Record version         | `v=aid1`                             | `v=aid2`                                 | Clear wire-format break.                                                                |
| PKA key encoding       | `k=z...` multibase/base58btc         | `k=<base64url>`                          | Uses the same value as the Ed25519 JWK `x` member.                                      |
| DNS key id             | `i=<kid>` required with `k`          | no `i` / no `kid`                        | The key id is derived from the key itself.                                              |
| HTTP signature `keyid` | compared to DNS `i`                  | RFC 7638 JWK thumbprint derived from `k` | Prevents a label from drifting away from the key.                                       |
| PKA freshness          | `created` plus local freshness check | mandatory `created` and `expires`        | Makes replay window explicit.                                                           |
| Challenge binding      | AID-specific `AID-Challenge` header  | RFC 9421 `nonce` parameter               | Closer to Web Bot Auth style and avoids custom covered header machinery.                |
| HTTP `Date`            | previously considered for signing    | not signed                               | `created`, `expires`, and `nonce` carry freshness with less proxy fragility.            |
| PKA caching            | not explicit enough                  | response `Cache-Control: no-store`       | Nonce-bound proofs must not be replayed by intermediaries.                              |
| Rotation               | `kid` looked rotation-related        | no DNS rotation mechanism in core        | DNS publishes the current key; real rotation belongs in a future key directory/profile. |
| `.well-known` fallback | fallback metadata                    | explicit `trustSource=well-known-tls`    | Avoids confusing TLS-hosted metadata with DNS-rooted trust.                             |

### Reader Shortcut

The largest conceptual change is that v2 removes the appearance of rotation support from DNS. The DNS record says "this is the current endpoint and key." If the key changes, the key changed. Clients with previous state apply local warning or failure policy. Managed overlap can be designed later in an HTTP key directory profile.

---

## 0. Glossary

| Term                   | Meaning                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| **AID Client**         | Software that performs discovery according to this specification.                       |
| **Provider**           | Entity that controls a domain and publishes the AID record.                             |
| **`_agent` subdomain** | The DNS name `_agent.<domain>` where the AID TXT record is published.                   |
| **PKA**                | Public Key for Agent: an optional Ed25519 endpoint-proof key in the AID record.         |
| **JWK `x`**            | The base64url-encoded public key member for an Ed25519 OKP JWK.                         |
| **JWK thumbprint**     | RFC 7638 hash of a canonical JWK representation. Used as the v2 HTTP signature `keyid`. |
| **Trust source**       | The source from which the selected AID record was obtained: `dns` or `well-known-tls`.  |

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, NOT RECOMMENDED, MAY, and OPTIONAL are to be interpreted as described in RFC 2119 and RFC 8174.

---

## 1. Design Goals

AID v2 keeps the v1 design goals and sharpens the boundary.

- **Zero-configuration discovery:** Given a domain, a client can discover the agent endpoint and protocol.
- **DNS-first deployment:** Discovery remains deployable through DNS TXT records.
- **Protocol agnostic:** AID discovers endpoints for MCP, A2A, OpenAPI, gRPC, GraphQL, WebSocket, local agents, and future protocols.
- **Endpoint proof:** When `k` is present, the endpoint proves possession of the matching private key.
- **Scope honesty:** AID does not issue credentials, grant authorization, prove human approval, define SPIFFE/WIMSE federation, or publish DID-like metadata.

> **Explainer:** v2 is not trying to make AID a full identity stack. It makes AID a cleaner first-contact anchor that other identity and authorization systems can safely build on.

### 1.1 Discovery Scope (Use Cases) — Idea, Not Yet Spec

> **Note: this section is exploratory, not normative.** It captures a framing we want to keep thinking about before any of it becomes spec text. The use-case scope decisions, the case-2 design space, and how AID should reference adjacent work are all open.

The agent-discovery problem space appears to contain at least three generic use cases, in increasing computational and latency cost:

1. **Known organization and known agent.** The requestor knows both the domain and the specific agent it wants to reach.
2. **Known organization, unknown agent.** The requestor knows the domain but needs to find which agents that organization publishes.
3. **Known capability, unknown organization or agent.** The requestor knows what it needs done but has no specific organization in mind.

AID v2 addresses **use case 1 directly**. Given `_agent.<exact-host>`, a client resolves to one endpoint, one protocol, and an optional endpoint-proof key.

**Use case 2 is an open design space.** Several patterns are conceivable — additional DNS labels, off-DNS organization indexes, or relying on protocol-layer mechanisms once first contact is made — and the choice between them deserves its own treatment rather than being bundled into the v2 PKA cleanup. Capability descriptors themselves remain a protocol-layer concern: MCP, A2A, and OpenAPI already define how an agent advertises its tools and resources, and AID does not duplicate or hash that surface in DNS.

**Use case 3 is out of scope for AID.** Capability-only discovery requires an indexing or search service that aggregates across organizations. The architectural assumption is that such services operate on top of AID and other discovery primitives, not within them.

> **Explainer:** Naming the layers explicitly helps position AID as the bottom of the stack: a small, stable, DNS-rooted anchor that other systems can compose above. AID does not aim to be the registry, the directory, the capability index, or the trust framework — it aims to be the thing all of those can begin from. How AID relates to other proposals in this space is being worked out separately and is not addressed here.

---

## 2. TXT Record Specification

A provider advertises its agent service by publishing a DNS TXT record at `_agent.<domain>`.

### 2.1 Format

The record is a single semicolon-delimited string of `key=value` pairs. Clients SHOULD trim leading and trailing whitespace from keys and values. Clients MUST ignore unknown keys unless the key has a known legacy meaning that is explicitly invalid in v2.

Clients MUST recognize single-letter lowercase aliases. A record MUST NOT include both a full key and its alias. Key comparisons are case-insensitive.

Providers SHOULD emit the short-key form for compact DNS deployment.

| Key       | Alias | Requirement | Description                                                                              | Example                                         |
| --------- | ----- | ----------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `version` | `v`   | Required    | The specification version. For v2 it MUST be `aid2`.                                     | `v=aid2`                                        |
| `uri`     | `u`   | Required    | Absolute `https://` URL for a remote agent, or a package/locator for local agents.       | `u=https://api.example.com/mcp`                 |
| `proto`   | `p`   | Required    | Protocol token from the protocol registry.                                               | `p=mcp`                                         |
| `auth`    | `a`   | Recommended | Authentication hint token from the auth registry.                                        | `a=oauth2_code`                                 |
| `desc`    | `s`   | Optional    | Short human-readable display text.                                                       | `s=Primary AI Gateway`                          |
| `docs`    | `d`   | Optional    | Absolute `https://` URL to human-readable documentation.                                 | `d=https://docs.example.com/agent`              |
| `dep`     | `e`   | Optional    | ISO 8601 UTC deprecation timestamp.                                                      | `e=2027-01-01T00:00:00Z`                        |
| `pka`     | `k`   | Optional    | Unpadded base64url Ed25519 public key. The value is exactly the RFC 8037 JWK `x` member. | `k=JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs` |

AID v2 records MUST NOT use `kid` or `i` for endpoint proof. A v2 record containing recognized `kid` or `i` is invalid.

> **Explainer: why keep `k` instead of renaming it to `x`?** JWK uses `x`, but AID's DNS field is not a JWK object. Keeping `k` makes the TXT record readable and avoids confusion with earlier rejected `x` rotation-chain ideas. The important alignment is the value: `k` is exactly the JWK `x` value.

> **Explainer: why reject `kid/i` instead of ignoring it?** In v1, `i` had a known meaning. Silently accepting it in v2 would let stale examples appear to work while the verifier actually uses a different key identity model.

### 2.2 Examples

**Remote MCP agent:**

```text
_agent.example.com. 300 IN TXT "v=aid2;u=https://api.example.com/mcp;p=mcp;a=pat;s=Example AI Tools"
```

**Remote MCP with PKA:**

```text
_agent.example.com. 300 IN TXT "v=aid2;p=mcp;u=https://api.example.com/mcp;k=JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs;a=oauth2_code;s=Secure AI Gateway"
```

**Local agent via Docker:**

```text
_agent.grafana.com. 300 IN TXT "v=aid2;u=docker:grafana/mcp:latest;p=local;a=pat;s=Run Grafana agent locally"
```

**Same key during v1 to v2 migration:**

```text
_agent.example.com. 300 IN TXT "v=aid1;p=mcp;u=https://api.example.com/mcp;k=<same-key-as-v1-multibase>;i=g1"
_agent.example.com. 300 IN TXT "v=aid2;p=mcp;u=https://api.example.com/mcp;k=<same-key-as-v2-base64url>"
```

> **Explainer:** A same-key migration is not a key rotation. The raw 32-byte Ed25519 public key stays the same; only its DNS encoding changes.

### 2.3 Client Discovery Algorithm

When given a domain, an AID client performs these steps:

1. Normalize the domain. If the domain contains non-ASCII characters, convert it to its Punycode A-label representation.
2. Query TXT records for the canonical base name `_agent.<exact-host-user-entered>`. Clients MUST NOT walk up to parent domains.
3. Parse returned TXT answers as semicolon-delimited `key=value` records.
4. Partition valid records by AID major version.
5. Select the highest supported valid version allowed by local policy, normally `aid2` before `aid1`.
6. Within the selected version, if exactly one valid record exists, use it. If more than one valid record exists, fail with ambiguity.
7. Process optional metadata: display `docs`, warn or fail on `dep` according to policy.
8. If `k` is present, perform PKA endpoint proof using Appendix B. Clients SHOULD send the `AID-Domain` request header by default (unless `domain-binding=off`), requesting the domain-bound proof shape described in Appendix B.7.
9. Return the discovered endpoint, protocol, metadata, PKA state (including the boolean `domainBound` indicator), and trust source.

Malformed answers do not matter when there is exactly one valid record in the selected version. Clients MUST NOT choose among multiple valid same-version records by DNS answer order.

Returning clients that previously selected `aid2` SHOULD treat an `aid1`-only result as a version downgrade.

> **Explainer:** The v2 migration needs version partitioning. Publishing `aid1` and `aid2` side by side should not trigger the same ambiguity rule as two competing `aid2` records.

If an application explicitly requests a protocol, v2 clients still query the canonical base name `_agent.<exact-host-user-entered>` first. Protocol-prefixed `_agent._<proto>.<exact-host-user-entered>` probing is legacy, diagnostic, or base-failure-only behavior where supported and explicitly configured. Clients MUST NOT perform a compatibility lookup at `_agent.<proto>.<domain>`.

`aid-doctor` diagnostics are base-first by default. A protocol hint does not change the primary lookup away from `_agent.<domain>` unless an explicit protocol-probe option requests diagnostic probing of `_agent._<proto>.<domain>`.

### 2.4 Exact-Host Semantics And Delegation

Discovery remains exact-host by default. If the application asks for `app.team.example.com`, the base query is `_agent.app.team.example.com`.

Clients MUST NOT implicitly retry parent hosts such as `_agent.team.example.com` or `_agent.example.com`.

If an operator wants child hosts to inherit a shared record, that inheritance MUST be expressed in DNS for the exact queried name, for example with a CNAME.

```dns
_agent.app.team.example.com. 300 IN CNAME _agent.shared.team.example.com.
_agent.shared.team.example.com. 300 IN TXT "v=aid2;p=mcp;u=https://gateway.team.example.com/mcp;k=<current-key>"
```

### 2.5 Multiple Protocols

The canonical v2 location remains `_agent.<domain>`, and clients query that base name by default. Providers MAY additionally publish protocol-specific names such as `_agent._mcp.<domain>` or `_agent._a2a.<domain>` for legacy clients, diagnostics, or explicitly configured base-failure probing.

Protocol-specific names always use the underscore form `_agent._<proto>.<domain>`. The form `_agent.<proto>.<domain>` is not part of v2 discovery.

---

## 3. Security Rules

- **DNSSEC:** Providers SHOULD sign DNS records with DNSSEC. Clients SHOULD validate DNSSEC when available.
- **HTTPS:** Remote agent URIs MUST use `https://`. Clients MUST perform standard TLS certificate and hostname validation.
- **No secrets:** TXT records are public and MUST NOT contain secrets.
- **Endpoint proof:** When the selected v2 record contains `k`, clients MUST verify endpoint proof using the PKA profile in Appendix B.
- **Local execution safeguards:** Clients that support `proto=local` MUST require explicit user consent, integrity checks, no shell interpretation of discovered arguments, no nested discovery execution, and SHOULD use sandboxing.

### 3.1 What PKA Proves

PKA proves exactly this:

> The endpoint reached at the discovered URI controls the Ed25519 private key corresponding to the public key currently published in the domain's selected AID record.

PKA does not prove:

- that a user authorized a specific action;
- that an OAuth token is valid;
- that a SPIFFE SVID belongs to a trust domain;
- that an internal policy engine approved a request;
- that a key change is cryptographically continuous with a previous key;
- that the endpoint consents to serve as the agent for the queried domain.

Because the response signature binds only the endpoint's own request context, any domain can publish a record containing another operator's endpoint URI and public key, and the endpoint proof still verifies. This _unauthorized association_ does not let the publishing domain impersonate the endpoint, but it falsely implies a relationship between the domain and the endpoint. Clients that need the endpoint's consent to the association use the domain-binding profile in Appendix B.7; v2 clients **SHOULD** request this by default.

> **Explainer:** This narrow trust claim is the core of v2. AID can help other systems decide where to begin trust establishment, but AID is not the whole trust establishment system.

### 3.2 Threat Model

Mitigations provided by AID v2:

- **DNS spoofing or cache poisoning:** DNSSEC validation, when available.
- **Endpoint impersonation:** PKA endpoint proof with Ed25519 HTTP Message Signatures.
- **PKA removal or key replacement:** Returning clients can detect changes when they retain previous security state.
- **Version downgrade:** Returning clients can detect `aid2` to `aid1` downgrade when they retain previous version state.
- **Command injection in local agents:** Local execution safeguards.
- **Cross-origin redirects:** PKA redirects are rejected.
- **Unauthorized association:** The domain-binding profile (Appendix B.7) — where the endpoint proves it consents to serve the queried domain by signing the `AID-Domain` request header. v2 clients SHOULD request this by default; `domain-binding=require` enforces it. See also Section 3.1.

Explicitly out of scope:

- compromised authoritative DNS servers;
- active attackers after TLS validation fails;
- authorization, delegation, user consent, reputation, or workload federation;
- managed cryptographic rotation in the core DNS record.

### 3.3 Enterprise Policy Modes

Clients that expose enterprise controls SHOULD provide simple policy knobs:

- **PKA policy:** `if-present | require`
- **DNSSEC policy:** `off | prefer | require`
- **Well-known policy:** `auto | disable`
- **Downgrade policy:** `off | warn | fail`
- **Domain-binding policy:** `off | prefer | require`

Policy semantics:

- `pka=require`: discovery fails if the selected record has no `k`.
- `dnssec=require`: discovery fails when DNSSEC validation is unavailable or unsuccessful for the selected DNS answer.
- `well-known=disable`: clients do not use `/.well-known/agent`.
- `downgrade=warn|fail`: applies to PKA removal, key replacement, and `aid2` to `aid1` downgrade when previous state exists.
- `domain-binding=off`: the client does not send `AID-Domain` on PKA requests.
- `domain-binding=prefer` (default): the client sends `AID-Domain`. A domain-bound proof (one whose covered set includes `"aid-domain";req`) is recorded as such; an unbound proof is still accepted. `prefer` records the outcome but does not enforce it.
- `domain-binding=require`: discovery fails unless the endpoint proof is domain-bound (its covered set includes `"aid-domain";req`). This is the only mode that mitigates unauthorized association (Section 3.1, Appendix B.7); merely sending `AID-Domain` does not. Has no effect when no `k` is present.

If discovery succeeds only through `.well-known`, the result cannot satisfy `dnssec=require`.

---

## 4. DNS And Caching

Providers SHOULD set a DNS TTL of 300 to 900 seconds on `_agent.<domain>` TXT records.

Clients MUST respect the TTL of DNS records and MUST NOT cache DNS records longer than the received TTL.

PKA responses are separate from DNS records. A nonce-bound PKA response MUST include:

```http
Cache-Control: no-store
```

Clients SHOULD also send `Cache-Control: no-store` on PKA requests.

> **Explainer:** DNS records can be cached according to DNS TTL. PKA responses are per-request proof artifacts bound to a nonce. Those must not be cached or replayed.

---

## 5. Rotation Stance

AID v2 core does not define DNS-level cryptographic key rotation.

The core record says:

```text
_agent.acme.com TXT "v=aid2;p=mcp;u=https://agent.acme.com/mcp;k=<current-key>"
```

That means:

- DNS currently publishes this endpoint and this key.
- The endpoint can prove possession of the corresponding private key.
- Verifiers can derive stable key identity from `k`.

It does not mean:

- the new key is authorized by the old key;
- multiple keys are active through DNS;
- DNS provides validity windows;
- AID core provides request provenance or delegated signing infrastructure.

If the key changes, the key changed. Clients with previous state decide whether to warn, fail, or accept according to local policy.

### Why No Multi-Key RRset In Core

The rejected-for-core shape is:

```dns
_agent.acme.com. 300 IN TXT "v=aid2;p=mcp;u=https://agent.acme.com/mcp;k=<old-key>"
_agent.acme.com. 300 IN TXT "v=aid2;p=mcp;u=https://agent.acme.com/mcp;k=<new-key>"
```

This is deferred because it changes the model from:

```text
domain -> one selected endpoint record -> optional proof key
```

to:

```text
domain -> one selected endpoint descriptor -> active key set -> response keyid selects key
```

That requires rules for normalized non-key field equivalence, duplicate handling, partial DNS propagation, key-set pinning, downgrade policy, SDK return types, and conformance fixtures. It also does not solve lost-key or compromised-key recovery.

### Future Rotation Profile

If AID later needs managed rotation for pinned clients or provenance profiles, it should be a separate HTTP key-directory profile, likely using JWKS/WBA-style overlap:

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "kid": "<jwk-thumbprint>",
      "x": "<public-key>",
      "use": "sig",
      "nbf": 1712793600,
      "exp": 1715385600
    }
  ]
}
```

If such a directory chains to DNS `k`, that chaining is the defining property of an AID-anchored key directory. If it does not chain to DNS `k`, it is a normal external WBA/JWKS-style directory outside AID core.

---

## 6. IANA And Label Strategy

The v2 design keeps `_agent.<domain>` as the discovery label for compatibility with existing deployments.

Label governance is separate from the v2 key-format and endpoint-proof updates, and may be addressed by a future working group or BoF process.

> **Explainer:** v2 can clarify PKA without forcing the namespace question into the same decision.

---

## 7. Registries

The auth and protocol registries remain compatible with legacy `aid1` records unless changed through the normal extension process.

### Auth Tokens

- `none`
- `pat`
- `apikey`
- `basic`
- `oauth2_device`
- `oauth2_code`
- `mtls`
- `custom`

### Protocol Tokens

| Token       | Meaning                       | Allowed URI schemes       |
| ----------- | ----------------------------- | ------------------------- |
| `mcp`       | Model Context Protocol        | `https://`                |
| `a2a`       | Agent-to-Agent Protocol       | `https://`                |
| `openapi`   | OpenAPI document              | `https://`                |
| `grpc`      | gRPC over HTTP/2 or HTTP/3    | `https://`                |
| `graphql`   | GraphQL over HTTP             | `https://`                |
| `websocket` | WebSocket transport           | `wss://`                  |
| `local`     | Local client-run agent        | `docker:`, `npx:`, `pip:` |
| `zeroconf`  | mDNS/DNS-SD service discovery | `zeroconf:<service_type>` |
| `ucp`       | Universal Commerce Protocol   | `https://`                |

> **Explainer:** v2 does not add an auth.md-specific auth token. A service that supports OAuth/auth.md can still advertise `a=oauth2_code`; the detailed agent registration flow is discovered at the OAuth/auth.md layer.

---

## Appendix A: Client Error Codes

Clients SHOULD continue using the existing error code family.

| Code   | Name                    | Meaning                                                           |
| ------ | ----------------------- | ----------------------------------------------------------------- |
| `1000` | `ERR_NO_RECORD`         | No AID DNS record was found.                                      |
| `1001` | `ERR_INVALID_TXT`       | A record was malformed, invalid, or ambiguous.                    |
| `1002` | `ERR_UNSUPPORTED_PROTO` | The protocol token is unsupported.                                |
| `1003` | `ERR_SECURITY`          | Discovery failed due to security policy or failed endpoint proof. |
| `1004` | `ERR_DNS_LOOKUP_FAILED` | DNS lookup failed for network-related reasons.                    |
| `1005` | `ERR_FALLBACK_FAILED`   | The `.well-known` fallback failed or returned invalid data.       |

---

## Appendix B: PKA Handshake

When `k` is present, clients MUST verify endpoint proof using HTTP Message Signatures with Ed25519.

### B.1 Key Decoding

For v2, `k` MUST be unpadded base64url. Decoding MUST produce exactly 32 octets. Legacy `z...` multibase keys MUST NOT be accepted in `v=aid2`.

The corresponding JWK is:

```json
{ "kty": "OKP", "crv": "Ed25519", "x": "<k>" }
```

### B.2 Derived `keyid`

The expected HTTP Message Signature `keyid` is the RFC 7638 JWK thumbprint using SHA-256 over this exact UTF-8 JSON serialization, with no extra spaces:

```text
{"crv":"Ed25519","kty":"OKP","x":"<k>"}
```

The SHA-256 digest is encoded as unpadded base64url. Implementations MUST NOT hash the raw public key bytes directly for `keyid`.

### B.3 Request And Response Shape

Validated RFC 9421 Structured Fields shape:

```http
Accept-Signature: aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created;expires;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
Signature-Input: aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created=<unix>;expires=<unix>;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
Signature: aid-pka=:<base64-signature>:
Cache-Control: no-store
```

The signature MUST NOT cover HTTP `Date`.

The client challenge MUST contain at least 32 bytes of entropy and SHOULD be transported as unpadded base64url in the RFC 9421 `nonce` signature parameter. The verifier MUST compare the received `nonce` exactly to the challenge it sent.

Servers are not required to store nonce state in v2 core because the verifier supplies the one-shot nonce and the signed response is not cacheable.

`created` and `expires` are mandatory. `expires` MUST be greater than `created`. `expires - created` MUST NOT exceed 300 seconds and SHOULD be 60 seconds or less. Verifiers MAY allow a small clock-skew tolerance when evaluating `created` and `expires`.

Signers MUST emit `alg="ed25519"` lowercase. Verifiers MUST compare the semantic algorithm value case-insensitively and MUST reconstruct `@signature-params` from the received Structured Field value.

### B.4 Covered Components

The v2 PKA response signature covers exactly:

- `"@method";req`
- `"@target-uri";req`
- `"@authority";req`
- _(optional)_ `"aid-domain";req` — present only in domain-bound proofs (see Appendix B.7); positioned between `"@authority";req` and `"@status"`
- `"@status"`

`@method`, `@target-uri`, and `@authority` are request-derived components and therefore use `;req`. `@status` is response-derived and does not use `;req`. The covered set is either those four base components, or those four plus the optional `"aid-domain";req` for domain-bound proofs. No other components are permitted.

`@status` signs the status actually returned. PKA does not require status `200`. A signed `401` can still prove endpoint authenticity before the OAuth/auth.md handoff continues.

### B.5 URI, Authority, And Redirects

Clients MUST NOT follow redirects during PKA verification. The request context is the discovered endpoint URI after fragment removal. Query strings are preserved.

`@authority` uses the externally visible request authority:

- lowercase hostname;
- omit default port;
- retain non-default port.

Servers behind reverse proxies must sign the externally visible request context, not internal hop-local scheme, host, or port values.

### B.6 Verifier Summary

A verifier accepts a v2 PKA response only when:

1. the selected AID record contains valid v2 `k`;
2. the response contains a valid `Signature-Input` and `Signature`;
3. the tag is `tag="aid-pka-v2"` and the covered components are exactly the four base components above, or those four plus the optional `"aid-domain";req` component (between `"@authority";req` and `"@status"`) per the domain-binding profile in Appendix B.7;
4. `keyid` equals the RFC 7638 thumbprint derived from DNS `k`;
5. `alg` has semantic value `ed25519`;
6. `nonce` exactly equals the verifier-generated challenge;
7. `created` and `expires` pass freshness checks;
8. the response includes `Cache-Control: no-store`;
9. Ed25519 verification succeeds over the reconstructed RFC 9421 signature base.

For domain binding (when `AID-Domain` was sent):

10. A response is domain-bound if and only if its covered set includes `"aid-domain";req` matching the exact `AID-Domain` value the client sent.
11. A client that did NOT send `AID-Domain` MUST reject a response whose covered set includes `aid-domain` (fail-closed).
12. If `domain-binding=require` is active and the verified proof is unbound (covered set omits `aid-domain`), fail with `ERR_SECURITY`.
13. Clients MUST expose a boolean `domainBound` indicator: `true` when `"aid-domain";req` was covered and verified for the queried domain, `false` otherwise.

> **Explainer:** This is a v2 wire-format break from the current SDK PKA handshake. That is intentional. The v1 text left too much RFC 9421 behavior implicit for independent implementations.

### B.7 Domain Binding

This profile lets an endpoint prove that it consents to serve as the agent for the queried domain, addressing the unauthorized-association gap described in Section 3.1. When `k` is present in an `aid2` record, clients SHOULD request domain binding by default. The domain-binding indicator in the discovery result is the expected outcome for well-configured v2 deployments; clients that need hard enforcement use `domain-binding=require` (Section 3.3).

There is a single RFC 9421 tag for all v2 PKA proofs: `aid-pka-v2`. A proof is domain-bound if and only if its signed covered set includes the `"aid-domain";req` component, positioned strictly between `"@authority";req` and `"@status"`.

A client requesting domain binding sends the queried domain in the `AID-Domain` request header and requests an extended response signature:

```http
AID-Domain: example.com
Accept-Signature: aid-pka=("@method";req "@target-uri";req "@authority";req "aid-domain";req "@status");created;expires;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
```

The `AID-Domain` value is the exact host the client queried, normalized to its A-label form, lowercased, and without a trailing dot or port.

A server that supports this profile and serves the named domain responds with the Appendix B.3 shape but with `"aid-domain";req` added after `"@authority";req` in the covered set. A server that does not serve the named domain **MUST NOT** produce a signature covering that `AID-Domain` value; it SHOULD respond with status `403` and no `Signature-Input` header — which constitutes a failed endpoint proof, so discovery fails for that domain (the intended outcome). A server that does not support this profile ignores the header and responds with the base Appendix B.3 shape (an unbound proof), which remains a valid endpoint proof without domain binding.

A client that did not send `AID-Domain` **MUST** reject a response whose covered set includes `aid-domain` (fail-closed). Clients expose a boolean `domainBound` indicator set `true` only when `aid-domain` was covered and the proof verified for the queried domain. Requesting binding does not by itself mitigate unauthorized association — only `domain-binding=require` does (Section 3.3).

> **Explainer:** The tag (`aid-pka-v2`) does not change between bound and unbound proofs. The covered set distinguishes them. Because `@signature-params` is itself signed, the presence or absence of `aid-domain` in the covered set is authenticated and cannot be altered without invalidating the signature.

---

## Appendix C: `.well-known` Fallback

AID remains DNS-first. The `.well-known` fallback is a convenience for environments where DNS TXT record creation is restricted.

- Path: `GET https://<domain>/.well-known/agent`
- Format: JSON mirroring v2 record keys.
- Trust source: `well-known-tls`
- Security: relies on TLS certificate validation. PKA may still apply, but it proves consistency with TLS-hosted metadata, not DNS-published external trust.

DNS-discovered records have `trustSource=dns`. Fallback-discovered records have `trustSource=well-known-tls`.

> **Explainer:** This distinction matters. If a policy requires DNSSEC-backed trust, `.well-known` cannot satisfy it.

---

## Appendix D: Composition Notes

These notes are non-normative.

### D.1 Web Bot Auth

AID v2 follows Web Bot Auth where the layers match: Ed25519, RFC 9421 HTTP Message Signatures, RFC 7638 JWK thumbprints, `created`, `expires`, `nonce`, and `tag`.

AID does not become Web Bot Auth. WBA signs automated client requests to origins. AID PKA proves endpoint control for a DNS-discovered agent endpoint.

Operators may reuse key material across AID and WBA if their threat model allows it, but AID does not recommend reuse. Reuse shares blast radius between endpoint proof and request-signing.

### D.2 auth.md And OAuth

AID can support auth.md without adding auth.md-specific fields to core:

1. AID resolves a domain to `u` and `p`.
2. If `k` is present, PKA verifies the endpoint.
3. The client follows the endpoint/protocol/OAuth layer, including RFC 9728 Protected Resource Metadata, RFC 8414 Authorization Server Metadata, and auth.md `agent_auth` flows where present.

AID does not specify ID-JAG `aud`, provider trust lists, registration payloads, scopes, credential types, revocation, or auth.md metadata registries.

### D.3 SPIFFE And WIMSE

AID may be used by future SPIFFE or WIMSE profiles as a public first-contact anchor.

AID v2 core does not define:

- SPIFFE trust-domain mapping;
- SPIFFE bundle federation;
- WIMSE hop re-binding;
- OAuth client registration;
- workload authorization.

### D.4 Pkarr

AID v2 remains compatible with the Pkarr-inspired idea of compact Ed25519 key material, but it does not adopt Pkarr's identity model.

Pkarr makes the public key the address and signs DNS packets under that key. AID remains DNS-authority-rooted: the DNS owner publishes the current endpoint and current endpoint-proof key inside a TXT payload.

Reviewer-facing language should say "DNS-current endpoint/key" and should not imply Pkarr-style self-certifying names, key-addressed identity, or cryptographic continuity across key changes.

---

## Appendix E: Migration Notes

### Provider Migration

1. Inventory current `aid1` records.
2. For PKA records, decode the v1 multibase/base58btc `k` to the 32-byte Ed25519 public key.
3. Encode those bytes as unpadded base64url. This is the v2 `k`.
4. Publish `v=aid2` with the same endpoint, protocol, and v2 `k`, without `i`.
5. Keep `aid1` during the compatibility window.
6. Remove `aid1` after old-client support is no longer needed.

### Client Migration

1. Support both `aid1` and `aid2` parsing.
2. Partition records by version before ambiguity checks.
3. Prefer `aid2` when both versions are valid and policy allows it.
4. Keep v1 PKA only for `aid1` records.
5. Store previous security state using derived JWK thumbprints so same-key v1 to v2 migration does not look like key replacement.

---

## Appendix F: Implementation Evidence Behind The Spec

These checks were used to turn the design notes into the current normative specification:

1. Preserve the committed canonical v2 PKA vector as the conformance anchor for `Accept-Signature`, `Signature-Input`, the signature base, and Ed25519 verification.
2. Record final cross-language verification evidence from the SDK implementation work.
3. Review the RFC 9421 / Structured Fields text against that evidence so the normative spec does not depend on preview-only validation notes.
4. Tighten the final non-normative auth.md wording without specifying ID-JAG audience, provider trust lists, registration payloads, or auth.md metadata registry details.

---

## Historical Reviewer Questions

1. Does the committed canonical vector give enough evidence to freeze the no-date RFC 9421 `aid-pka` response signature shape?
2. Do the SDK implementation results show compatible Structured Fields parsing and signature-base reconstruction across languages?
3. Are the covered components sufficient to bind request target, response status, and nonce challenge?
4. Are the nonce, expiry, clock-skew, redirect, cache, and authority rules practical for real deployments?
5. Is signed non-`200` response support, especially signed `401`, the right way to support OAuth/auth.md handoff?
6. Is side-by-side `aid1`/`aid2` publication with version partitioning acceptable for migration?
7. Is the `_agent` label note sufficient while the IETF label decision remains decoupled from PKA cleanup?
8. Is the future key-directory boundary clear enough?
9. Does the SPIFFE/WIMSE/OAuth/auth.md composition guardrail avoid overclaiming?
10. Is the Pkarr boundary clear enough?
