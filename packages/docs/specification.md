---
title: 'Specification'
description: 'Specification'
icon: material/file-document-outline

extra_css_class: aid-page

tags:
  - v2.0
  - '2026-06-01'
---

[View raw markdown](https://github.com/agentcommunity/agent-identity-discovery/raw/main/packages/docs/specification.md)

# **Agent Identity & Discovery (AID) - v2.0.0**

_Minimal, DNS-first agent bootstrap standard_

**Date:** 1 June 2026
**Editor:** Agent Community
**Status:** Current normative specification

---

## **Abstract**

Agent Identity & Discovery (AID) answers one question: **"Given a domain, where is the agent and which protocol should I speak?"** It does so with a DNS TXT record at the well-known base name `_agent.<domain>`.

AID is an intentionally minimal discovery layer. After a client uses AID to find the correct endpoint or package, richer protocols such as the Model Context Protocol (MCP), Agent-to-Agent Protocol (A2A), OpenAPI, OAuth, or auth.md take over for communication, capability negotiation, authentication, and authorization.

AID v2 is the current default wire format. The `aid2` record keeps DNS-first discovery, makes the base `_agent.<domain>` lookup canonical, and updates endpoint proof so the DNS key is an Ed25519 JWK `x` value with an RFC 7638 derived key identifier. Legacy `aid1` remains a compatibility format for clients that need to read older records.

---

## **0. Glossary**

| Term                   | Meaning                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| **AID Client**         | Software that performs discovery according to this specification.                       |
| **Provider**           | Entity that controls a domain and publishes the AID record.                             |
| **`_agent` subdomain** | The DNS name `_agent.<domain>` where the canonical AID TXT record is published.         |
| **A-label**            | The Punycode representation of an Internationalized Domain Name, as defined by RFC5890. |
| **PKA**                | Public Key for Agent: an optional Ed25519 endpoint-proof key in the AID record.         |
| **JWK `x`**            | The base64url-encoded public key member for an Ed25519 OKP JWK.                         |
| **JWK thumbprint**     | RFC 7638 hash of a canonical JWK representation. Used as the v2 HTTP signature `keyid`. |
| **Trust source**       | The source from which the selected AID record was obtained: `dns` or `well-known-tls`.  |

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC2119 and RFC8174.

---

## **1. Design Goals**

- **Zero-configuration discovery:** Given a domain, a client can discover the agent endpoint and protocol.
- **DNS-first deployment:** Discovery remains deployable through DNS TXT records.
- **Protocol agnostic:** AID discovers endpoints for MCP, A2A, OpenAPI, gRPC, GraphQL, WebSocket, local agents, and future protocols.
- **Endpoint proof:** When `k` is present, the endpoint proves possession of the matching Ed25519 private key.
- **Scope honesty:** AID does not issue credentials, grant authorization, prove human approval, define SPIFFE/WIMSE federation, or publish DID-like metadata.
- **Clear compatibility:** `aid2` is the current/default record version. `aid1` is a legacy compatibility version.

---

## **2. TXT Record Specification**

A provider **MUST** advertise its agent service by publishing a DNS TXT record at the canonical base name `_agent.<domain>`.

### **2.1. Format**

For AID v2, providers **MUST** use DNS TXT records for discovery. TXT records remain the baseline because they are widely deployable across DNS providers and registrar control panels. Future AID versions may adopt other record types, but v2 uses the stable `_agent` label and TXT payload defined here.

The record **MUST** be a single semicolon-delimited string of `key=value` pairs. Clients **SHOULD** trim leading and trailing whitespace from keys and values. Clients **MUST** ignore unknown keys unless the key has a known legacy meaning that this specification explicitly rejects for `aid2`.

If a DNS server splits the TXT record into multiple 255-octet character strings, the client **MUST** concatenate them in order before parsing. Providers **SHOULD** keep total payload size below 255 bytes when possible.

Clients **MUST** recognize single-letter lowercase aliases. A record **MUST NOT** include both a full key and its alias. Key comparisons are case-insensitive.

Providers **SHOULD** emit the short-key form for compact DNS deployment.

| Key       | Alias | Requirement  | Description                                                                              | Example                                         |
| --------- | ----- | ------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `version` | `v`   | **Required** | The specification version. For v2 it **MUST** be `aid2`.                                 | `v=aid2`                                        |
| `uri`     | `u`   | **Required** | Absolute `https://` URL for a remote agent, `wss://` for WebSocket, or a local locator.  | `u=https://api.example.com/mcp`                 |
| `proto`   | `p`   | **Required** | Protocol token from the protocol registry.                                               | `p=mcp`                                         |
| `auth`    | `a`   | Recommended  | Authentication hint token from the auth registry.                                        | `a=oauth2_code`                                 |
| `desc`    | `s`   | Optional     | Short human-readable display text.                                                       | `s=Primary AI Gateway`                          |
| `docs`    | `d`   | Optional     | Absolute `https://` URL to human-readable documentation.                                 | `d=https://docs.example.com/agent`              |
| `dep`     | `e`   | Optional     | ISO 8601 UTC deprecation timestamp.                                                      | `e=2027-01-01T00:00:00Z`                        |
| `pka`     | `k`   | Optional     | Unpadded base64url Ed25519 public key. The value is exactly the RFC 8037 JWK `x` member. | `k=JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs` |

AID v2 records **MUST NOT** use `kid` or `i` for endpoint proof. A `v=aid2` record containing `kid` or `i` is invalid.

### **2.2. Examples**

**Remote MCP agent:**

```text
_agent.example.com. 300 IN TXT "v=aid2;u=https://api.example.com/mcp;p=mcp;a=pat;s=Example AI Tools"
```

**Remote MCP with PKA:**

```text
_agent.example.com. 300 IN TXT "v=aid2;p=mcp;u=https://api.example.com/mcp;k=JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs;a=oauth2_code;s=Secure AI Gateway"
```

**WebSocket agent:**

```text
_agent.example.com. 300 IN TXT "v=aid2;p=websocket;u=wss://agent.example.com/session;a=oauth2_code;s=Streaming Agent"
```

**Local agent via Docker:**

```text
_agent.grafana.com. 300 IN TXT "v=aid2;u=docker:grafana/mcp:latest;p=local;a=pat;s=Run Grafana agent locally"
```

**Legacy compatibility during migration:**

```text
_agent.example.com. 300 IN TXT "v=aid1;p=mcp;u=https://api.example.com/mcp;k=<legacy-v1-multibase-key>;i=g1"
_agent.example.com. 300 IN TXT "v=aid2;p=mcp;u=https://api.example.com/mcp;k=<same-key-as-v2-base64url>"
```

Clients that support both versions partition by version before ambiguity checks. A same-key migration from legacy `aid1` to current `aid2` is not a key rotation when the decoded Ed25519 public key bytes are the same.

### **2.3. Client Discovery Algorithm**

An AID client, when given a `<domain>`, **MUST** perform these steps:

1. Normalize the domain. If the domain contains non-ASCII characters, convert it to its Punycode A-label representation.
2. Query TXT records for the canonical base name `_agent.<exact-host-user-entered>`. Clients **MUST NOT** walk up to parent domains.
3. Parse returned TXT answers as semicolon-delimited `key=value` records. Key comparisons are case-insensitive.
4. Validate records using versioned rules. For `aid2`, require `v`, `u`, and `p`; reject a record containing both a full key and alias; reject `kid` or `i`; and reject malformed `k` values.
5. Partition valid records by AID major version.
6. Select the highest supported valid version allowed by local policy. Clients that support `aid2` **SHOULD** prefer `aid2` over `aid1`.
7. Within the selected version, if exactly one valid record exists, use it. If more than one valid record exists, fail with ambiguity. Clients **MUST NOT** choose among multiple valid same-version records by DNS answer order.
8. Process optional metadata. If `docs` (`d`) is present, clients MAY display it. If `dep` (`e`) is in the future, clients SHOULD warn. If `dep` is in the past, clients SHOULD fail gracefully.
9. If `k` is present, perform PKA endpoint proof using Appendix B.
10. Return the discovered endpoint, protocol, metadata, PKA state, and trust source.

Malformed answers do not matter when there is exactly one valid record in the selected version. Returning clients that previously selected `aid2` **SHOULD** treat an `aid1`-only result as a version downgrade.

If no DNS record is found or DNS lookup fails, the client **MAY** attempt the `.well-known` fallback on the same exact host as described in Appendix C. If both DNS and fallback fail, discovery fails.

#### **Table 1: Standard Client Error Codes**

Client implementations **SHOULD** use these codes to report specific failure modes. See Appendix A for definitions.

| Code   | Name                    | Meaning                                                           |
| ------ | ----------------------- | ----------------------------------------------------------------- |
| `1000` | `ERR_NO_RECORD`         | No AID DNS record was found.                                      |
| `1001` | `ERR_INVALID_TXT`       | A record was malformed, invalid, or ambiguous.                    |
| `1002` | `ERR_UNSUPPORTED_PROTO` | The protocol token is unsupported.                                |
| `1003` | `ERR_SECURITY`          | Discovery failed due to security policy or failed endpoint proof. |
| `1004` | `ERR_DNS_LOOKUP_FAILED` | DNS lookup failed for network-related reasons.                    |
| `1005` | `ERR_FALLBACK_FAILED`   | The `.well-known` fallback failed or returned invalid data.       |

### **2.4. Exact-Host Semantics And Delegation**

Discovery is exact-host by default. If the application asks for `app.team.example.com`, the base query is `_agent.app.team.example.com`.

Clients **MUST NOT** implicitly retry parent hosts such as `_agent.team.example.com` or `_agent.example.com`.

If an operator wants child hosts to inherit a shared record, that inheritance **MUST** be expressed in DNS for the exact queried name. A common pattern is a CNAME from the child host's `_agent` label to a shared `_agent` record.

```dns
_agent.app.team.example.com. 300 IN CNAME _agent.shared.team.example.com.
_agent.shared.team.example.com. 300 IN TXT "v=aid2;p=mcp;u=https://gateway.team.example.com/mcp;k=<current-key>"
```

### **2.5. Protocol-Specific Names**

The canonical v2 location is the base record: `_agent.<domain>`. Providers **MAY** additionally publish protocol-specific names such as `_agent._mcp.<domain>` or `_agent._a2a.<domain>` for legacy clients, diagnostics, or explicitly configured base-failure probing.

When an application explicitly requests a protocol, v2 clients still query the canonical base name `_agent.<exact-host-user-entered>` first and filter that record for the requested protocol. Protocol-prefixed `_agent._<proto>.<exact-host-user-entered>` probing is legacy, diagnostic, or base-failure-only behavior where supported and explicitly configured.

Clients **MUST NOT** perform a compatibility lookup at `_agent.<proto>.<domain>`. Protocol-specific names, when used, always use the underscore form `_agent._<proto>.<domain>`.

`aid-doctor` diagnostics are base-first by default. A protocol hint does not change the primary lookup away from `_agent.<domain>` unless an explicit protocol-probe option requests diagnostic probing of `_agent._<proto>.<domain>`.

---

## **3. Security Rules**

- **DNSSEC:** Providers **SHOULD** sign DNS records with DNSSEC. Clients **SHOULD** validate DNSSEC when available.
- **HTTPS:** Remote agent URIs **MUST** use `https://`, except `proto=websocket` which **MUST** use `wss://`. Clients **MUST** perform standard TLS certificate and hostname validation.
- **No secrets:** TXT records are public and **MUST NOT** contain secrets.
- **Endpoint proof:** When the selected `aid2` record contains `k`, clients **MUST** verify endpoint proof using the PKA profile in Appendix B.
- **Local execution safeguards:** Clients that support `proto=local` **MUST** require explicit user consent, integrity checks, no shell interpretation of discovered arguments, and no nested discovery execution. They **SHOULD** use sandboxing.
- **Redirect handling:** Clients **MUST NOT** follow redirects during PKA verification or `.well-known` fallback. For normal protocol use after discovery, clients **MUST NOT** automatically follow cross-origin redirects from the discovered endpoint without policy approval or user confirmation.

### **3.1. What PKA Proves**

PKA proves exactly this:

> The endpoint reached at the discovered URI controls the Ed25519 private key corresponding to the public key currently published in the domain's selected AID record.

PKA does not prove:

- that a user authorized a specific action;
- that an OAuth token is valid;
- that a SPIFFE SVID belongs to a trust domain;
- that an internal policy engine approved a request;
- that a key change is cryptographically continuous with a previous key.

### **3.2. Threat Model**

AID's security model addresses the following threat landscape.

**Assumptions:**

- DNS resolvers are trusted for transport unless a client requires DNSSEC.
- HTTPS endpoints are verified through standard TLS certificate validation.
- The TXT record is public data. No secrets are transmitted through DNS.

**Mitigations provided:**

- **DNS spoofing or cache poisoning:** DNSSEC validation, when available.
- **Endpoint impersonation:** PKA endpoint proof with Ed25519 HTTP Message Signatures.
- **PKA removal or key replacement:** Returning clients can detect changes when they retain previous security state.
- **Version downgrade:** Returning clients can detect `aid2` to `aid1` downgrade when they retain previous version state.
- **Command injection in local agents:** Local execution safeguards.
- **Cross-origin redirects:** PKA redirects are rejected, and cross-origin protocol redirects are not automatic.

**Explicitly out of scope:**

- compromised authoritative DNS servers beyond DNSSEC;
- active attackers after TLS validation fails;
- authorization, delegation, user consent, reputation, or workload federation;
- managed cryptographic rotation in the core DNS record.

### **3.3. Enterprise Policy Modes**

Clients that expose enterprise controls **SHOULD** provide simple policy knobs:

- **PKA policy:** `if-present | require`
- **DNSSEC policy:** `off | prefer | require`
- **Well-known policy:** `auto | disable`
- **Downgrade policy:** `off | warn | fail`

Policy semantics:

- `pka=require`: discovery fails if the selected record has no `k`.
- `dnssec=require`: discovery fails when DNSSEC validation is unavailable or unsuccessful for the selected DNS answer.
- `well-known=disable`: clients do not use `/.well-known/agent`.
- `downgrade=warn|fail`: applies to PKA removal, key replacement, and `aid2` to `aid1` downgrade when previous state exists.

If discovery succeeds only through `.well-known`, the result cannot satisfy `dnssec=require`.

---

## **4. DNS And Caching**

Providers **SHOULD** set a DNS TTL of 300 to 900 seconds on `_agent.<domain>` TXT records.

Clients **MUST** respect the TTL of DNS records and **MUST NOT** cache DNS records longer than the received TTL.

PKA responses are separate from DNS records. A nonce-bound PKA response **MUST** include:

```http
Cache-Control: no-store
```

Clients **SHOULD** also send `Cache-Control: no-store` on PKA requests.

---

## **5. Rotation Stance**

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

### **5.1. Why No Multi-Key RRset In Core**

This shape is not valid in v2 core:

```dns
_agent.acme.com. 300 IN TXT "v=aid2;p=mcp;u=https://agent.acme.com/mcp;k=<old-key>"
_agent.acme.com. 300 IN TXT "v=aid2;p=mcp;u=https://agent.acme.com/mcp;k=<new-key>"
```

It changes the model from:

```text
domain -> one selected endpoint record -> optional proof key
```

to:

```text
domain -> one selected endpoint descriptor -> active key set -> response keyid selects key
```

That requires rules for normalized non-key field equivalence, duplicate handling, partial DNS propagation, key-set pinning, downgrade policy, SDK return types, and conformance fixtures. It also does not solve lost-key or compromised-key recovery.

### **5.2. Future Rotation Profile**

If AID later needs managed rotation for pinned clients or provenance profiles, it should be a separate HTTP key-directory profile, likely using JWKS or Web Bot Auth style overlap:

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

If such a directory chains to DNS `k`, that chaining is the defining property of an AID-anchored key directory. If it does not chain to DNS `k`, it is a normal external key directory outside AID core.

---

## **6. Label Strategy**

AID v2 keeps `_agent.<domain>` as the discovery label for compatibility with existing deployments.

Label governance is separate from the v2 key-format and endpoint-proof updates, and may be addressed by a future working group or BoF process.

---

## **7. Registries**

The auth and protocol registries remain compatible with legacy `aid1` records unless changed through the normal extension process.

### **7.1. Auth Tokens**

- `none`
- `pat`
- `apikey`
- `basic`
- `oauth2_device`
- `oauth2_code`
- `mtls`
- `custom`

### **7.2. Protocol Tokens**

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

---

## **Appendix A: Client Error Codes**

Clients **SHOULD** continue using the existing error code family.

| Code   | Name                    | Meaning                                                           |
| ------ | ----------------------- | ----------------------------------------------------------------- |
| `1000` | `ERR_NO_RECORD`         | No AID DNS record was found.                                      |
| `1001` | `ERR_INVALID_TXT`       | A record was malformed, invalid, or ambiguous.                    |
| `1002` | `ERR_UNSUPPORTED_PROTO` | The protocol token is unsupported.                                |
| `1003` | `ERR_SECURITY`          | Discovery failed due to security policy or failed endpoint proof. |
| `1004` | `ERR_DNS_LOOKUP_FAILED` | DNS lookup failed for network-related reasons.                    |
| `1005` | `ERR_FALLBACK_FAILED`   | The `.well-known` fallback failed or returned invalid data.       |

---

## **Appendix B: PKA Handshake**

When `k` is present, clients **MUST** verify endpoint proof using HTTP Message Signatures with Ed25519.

### **B.1. Key Decoding**

For v2, `k` **MUST** be unpadded base64url. Decoding **MUST** produce exactly 32 octets. Legacy `z...` multibase keys **MUST NOT** be accepted in `v=aid2`.

The corresponding JWK is:

```json
{ "kty": "OKP", "crv": "Ed25519", "x": "<k>" }
```

### **B.2. Derived `keyid`**

The expected HTTP Message Signature `keyid` is the RFC 7638 JWK thumbprint using SHA-256 over this exact UTF-8 JSON serialization, with no extra spaces:

```text
{"crv":"Ed25519","kty":"OKP","x":"<k>"}
```

The SHA-256 digest is encoded as unpadded base64url. Implementations **MUST NOT** hash the raw public key bytes directly for `keyid`.

### **B.3. Request And Response Shape**

Validated RFC 9421 Structured Fields shape:

```http
Accept-Signature: aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created;expires;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
Signature-Input: aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created=<unix>;expires=<unix>;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
Signature: aid-pka=:<base64-signature>:
Cache-Control: no-store
```

The signature **MUST NOT** cover HTTP `Date`.

The client challenge **MUST** contain at least 32 bytes of entropy and **SHOULD** be transported as unpadded base64url in the RFC 9421 `nonce` signature parameter. The verifier **MUST** compare the received `nonce` exactly to the challenge it sent.

Servers are not required to store nonce state in v2 core because the verifier supplies the one-shot nonce and the signed response is not cacheable.

`created` and `expires` are mandatory. `expires` **MUST** be greater than `created`. `expires - created` **MUST NOT** exceed 300 seconds and **SHOULD** be 60 seconds or less. Verifiers **MAY** allow a small clock-skew tolerance when evaluating `created` and `expires`.

Signers **MUST** emit `alg="ed25519"` lowercase. Verifiers **MUST** compare the semantic algorithm value case-insensitively and **MUST** reconstruct `@signature-params` from the received Structured Field value.

### **B.4. Covered Components**

The v2 PKA response signature covers:

- `"@method";req`
- `"@target-uri";req`
- `"@authority";req`
- `"@status"`

`@method`, `@target-uri`, and `@authority` are request-derived components and therefore use `;req`. `@status` is response-derived and does not use `;req`.

`@status` signs the status actually returned. PKA does not require status `200`. A signed `401` can still prove endpoint authenticity before the OAuth/auth.md handoff continues.

### **B.5. URI, Authority, And Redirects**

Clients **MUST NOT** follow redirects during PKA verification. The request context is the discovered endpoint URI after fragment removal. Query strings are preserved.

`@authority` uses the externally visible request authority:

- lowercase hostname;
- omit default port;
- retain non-default port.

Servers behind reverse proxies must sign the externally visible request context, not internal hop-local scheme, host, or port values.

### **B.6. Verifier Summary**

A verifier accepts a v2 PKA response only when:

1. the selected AID record contains valid v2 `k`;
2. the response contains a valid `Signature-Input` and `Signature`;
3. the covered components and `tag="aid-pka-v2"` match this profile;
4. `keyid` equals the RFC 7638 thumbprint derived from DNS `k`;
5. `alg` has semantic value `ed25519`;
6. `nonce` exactly equals the verifier-generated challenge;
7. `created` and `expires` pass freshness checks;
8. the response includes `Cache-Control: no-store`;
9. Ed25519 verification succeeds over the reconstructed RFC 9421 signature base.

---

## **Appendix C: `.well-known` Fallback**

AID remains DNS-first. The `.well-known` fallback is a convenience for environments where DNS TXT record creation is restricted.

- Path: `GET https://<domain>/.well-known/agent`
- Format: JSON mirroring v2 record keys.
- Trust source: `well-known-tls`
- Security: relies on TLS certificate validation. PKA may still apply, but it proves consistency with TLS-hosted metadata, not DNS-published external trust.

DNS-discovered records have `trustSource=dns`. Fallback-discovered records have `trustSource=well-known-tls`.

If a policy requires DNSSEC-backed trust, `.well-known` cannot satisfy it.

---

## **Appendix D: Composition Notes**

These notes are non-normative.

### **D.1. Web Bot Auth**

AID v2 follows Web Bot Auth where the layers match: Ed25519, RFC 9421 HTTP Message Signatures, RFC 7638 JWK thumbprints, `created`, `expires`, `nonce`, and `tag`.

AID does not become Web Bot Auth. WBA signs automated client requests to origins. AID PKA proves endpoint control for a DNS-discovered agent endpoint.

Operators may reuse key material across AID and WBA if their threat model allows it, but AID does not recommend reuse. Reuse shares blast radius between endpoint proof and request-signing.

### **D.2. auth.md And OAuth**

AID can support auth.md without adding auth.md-specific fields to core:

1. AID resolves a domain to `u` and `p`.
2. If `k` is present, PKA verifies the endpoint.
3. The client follows the endpoint/protocol/OAuth layer, including RFC 9728 Protected Resource Metadata, RFC 8414 Authorization Server Metadata, and auth.md `agent_auth` flows where present.

AID does not specify ID-JAG `aud`, provider trust lists, registration payloads, scopes, credential types, revocation, or auth.md metadata registries.

### **D.3. SPIFFE And WIMSE**

AID may be used by future SPIFFE or WIMSE profiles as a public first-contact anchor.

AID v2 core does not define:

- SPIFFE trust-domain mapping;
- SPIFFE bundle federation;
- WIMSE hop re-binding;
- OAuth client registration;
- workload authorization.

### **D.4. Pkarr**

AID v2 remains compatible with the Pkarr-inspired idea of compact Ed25519 key material, but it does not adopt Pkarr's identity model.

Pkarr makes the public key the address and signs DNS packets under that key. AID remains DNS-authority-rooted: the DNS owner publishes the current endpoint and current endpoint-proof key inside a TXT payload.

Specification and reviewer-facing language should say "DNS-current endpoint/key" and should not imply Pkarr-style self-certifying names, key-addressed identity, or cryptographic continuity across key changes.

---

## **Appendix E: Migration Notes**

### **E.1. Provider Migration**

1. Inventory current legacy `aid1` records.
2. For PKA records, decode the v1 multibase/base58btc `k` to the 32-byte Ed25519 public key.
3. Encode those bytes as unpadded base64url. This is the v2 `k`.
4. Publish `v=aid2` with the same endpoint, protocol, and v2 `k`, without `i`.
5. Keep `aid1` during the compatibility window.
6. Remove `aid1` after old-client support is no longer needed.

### **E.2. Client Migration**

1. Support both `aid1` and `aid2` parsing.
2. Partition records by version before ambiguity checks.
3. Prefer `aid2` when both versions are valid and policy allows it.
4. Keep legacy PKA only for `aid1` records.
5. Store previous security state using derived JWK thumbprints so same-key `aid1` to `aid2` migration does not look like key replacement.
