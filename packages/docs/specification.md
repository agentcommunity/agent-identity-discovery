---
title: 'Specification - AID'
description: 'Specification'
icon: material/file-document-outline

extra_css_class: aid-page

tags:
  - v1.2
  - '2026-02-06'
---

[View raw markdown](https://github.com/agentcommunity/agent-identity-discovery/raw/main/packages/docs/specification.md)

# **Agent Identity & Discovery (AID) — v1.2.0**

_Minimal, DNS-first agent bootstrap standard_

**Date:** 6 February 2026
**Editor:** Agent Community
**Status:** Final

---

## **Abstract**

Agent Identity & Discovery (AID) answers one question: **"Given a domain, where is the agent and which protocol should I speak?"** It does so with a single DNS TXT record at a well-known subdomain: `_agent.<domain>`.

This protocol is an intentionally minimal discovery layer. After a client uses AID to find the correct endpoint or package, richer protocols such as the Model Context Protocol (MCP) or the Agent-to-Agent Protocol (A2A) take over for communication and capability negotiation.

This document defines the record format, a simple client algorithm, and strict security rules. It does not include manifests, capability lists, or runtime orchestration.

---

## **0. Glossary**

| Term                  | Meaning                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------ |
| **AID Client**        | Any software that performs discovery according to this specification.                      |
| **Provider**          | The entity that controls a domain and is responsible for publishing the AID TXT record.    |
| **\_agent subdomain** | The well-known subdomain `_agent.<domain>` where the AID TXT record **MUST** be published. |
| **A-label**           | The Punycode representation of an Internationalized Domain Name (IDN), as per [RFC5890].   |

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [RFC2119] and [RFC8174].

---

## **1. Design Goals**

- **Zero-Configuration:** A user types a domain, and the client automatically discovers how to connect.
- **Decentralized and Deployable:** The standard uses DNS TXT records, which are universally supported and require no central registry.
- **Protocol-Agnostic:** AID discovers agents speaking any protocol, including MCP, A2A, OpenAPI, or even local package-based protocols.
- **Clear Upgrade Path:** A future AID v2 is planned to use DNS SRV records, leveraging the same `_agent` service label established in this specification.

---

## **2. TXT Record Specification**

A provider **MUST** advertise its agent service by publishing a single DNS TXT record at `_agent.<domain>`.

### **2.1. Format**

The record **MUST** be a single string of semicolon-delimited `key=value` pairs. Clients **SHOULD** `trim()` leading and trailing whitespace from keys and values. Clients **MUST** ignore unknown keys. If a DNS server splits the record into multiple 255-octet strings, the client **MUST** concatenate them in order before parsing. Keep the total length under 255 bytes when possible.

Clients **MUST** recognize single-letter lowercase aliases for all keys. A record **MUST NOT** include both a full key and its alias. Key comparisons are case-insensitive.

| Key       | Alias | Requirement  | Description                                                                                           | Example                            |
| --------- | ----- | ------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `version` | `v`   | **Required** | The specification version. For v1 it **MUST** be `aid1`.                                              | `v=aid1`                           |
| `uri`     | `u`   | **Required** | An absolute `https://` URL for a remote agent, or a package/locator for local agents. See Appendix B. | `u=https://api.example.com/mcp`    |
| `proto`   | `p`   | **Required** | The protocol token from Appendix B.                                                                   | `p=mcp`                            |
| `auth`    | `a`   | Recommended  | An authentication hint token from Appendix A.                                                         | `a=pat`                            |
| `desc`    | `s`   | Optional     | Short, human-readable text (≤ 60 UTF-8 bytes) for UI display.                                         | `s=Primary AI Gateway`             |
| `docs`    | `d`   | Optional     | Absolute `https://` URL to human-readable documentation.                                              | `d=https://docs.example.com/agent` |
| `dep`     | `e`   | Optional     | ISO 8601 UTC timestamp indicating deprecation.                                                        | `e=2026-01-01T00:00:00Z`           |
| `pka`     | `k`   | Optional     | Multibase-encoded Ed25519 public key for endpoint proof. Requires `kid` when present.                 | `k=z...`                           |
| `kid`     | `i`   | Conditional  | 1–6 char rotation id `[a-z0-9]`. Required when `pka` is present.                                      | `i=g1`                             |

### **2.2. Examples**

**Remote MCP Agent:**

```text
_agent.example.com. 300 IN TXT "v=aid1;u=https://api.example.com/mcp;p=mcp;a=pat;s=Example AI Tools"
```

**Local Agent via Docker:**

```text
_agent.grafana.com. 300 IN TXT "v=aid1;u=docker:grafana/mcp:latest;p=local;a=pat;s=Run Grafana agent locally"
```

**Remote MCP with PKA and metadata (v1.2):**

```text
_agent.example.com. 300 IN TXT "v=aid1;p=mcp;u=https://api.example.com/mcp;k=z7rW8rTq8o4mM6vVf7w1k3m4uQn9p2YxCAbcDeFgHiJ;i=g1;d=https://docs.example.com/agent;e=2026-01-01T00:00:00Z;s=Secure AI Gateway"
```

**Local Zeroconf (v1.2):**

```text
_agent.local.test. 300 IN TXT "v=aid1;p=zeroconf;u=zeroconf:_mcp._tcp;s=Local Dev Agent"
```

### **2.3. Client Discovery Algorithm**

An AID Client, when given a `<domain>`, **MUST** perform these steps:

1.  Normalize domain. If the domain contains non-ASCII characters, convert it to its Punycode A-label representation ([RFC5890]).
2.  DNS lookup. Query the `TXT` record for `_agent.<domain>`. If no record is found or the lookup fails, the client MAY attempt a `.well-known` fallback (Appendix E). If both fail, stop with an error.
3.  Parse and validate. Parse the record's `key=value` pairs. Key comparisons **MUST** be case-insensitive. The record is invalid if it lacks `v=aid1` and both a `uri` (`u`) and a protocol (`proto` or `p`). Clients **MUST** recognize single-letter aliases for all keys.
4.  Optional metadata. If `docs` (`d`) is present, clients MAY display it. If `dep` (`e`) is in the future, clients SHOULD warn. If `dep` is in the past, clients SHOULD fail gracefully.
5.  Endpoint proof. If `pka` (`k`) is present, clients **MUST** perform the handshake in Appendix D. Use HTTP Message Signatures (RFC 9421) with Ed25519. Clients SHOULD warn on downgrade if a previously present `pka` is removed.
6.  Return result. If validation succeeds, return the discovered details. If the client does not support the discovered protocol token, it **MUST** fail with the appropriate error code.

#### **Table 1: Standard Client Error Codes**

Client implementations **SHOULD** use these codes to report specific failure modes. See Appendix C for numeric constants.

| Code   | Name                    | Meaning                                                                                   |
| ------ | ----------------------- | ----------------------------------------------------------------------------------------- |
| `1000` | `ERR_NO_RECORD`         | No `_agent` TXT record was found for the domain.                                          |
| `1001` | `ERR_INVALID_TXT`       | A record was found but is malformed or missing required keys.                             |
| `1002` | `ERR_UNSUPPORTED_PROTO` | The record is valid, but the client does not support the specified protocol.              |
| `1003` | `ERR_SECURITY`          | Discovery failed due to a security policy (e.g., DNSSEC failure, local execution denied). |
| `1004` | `ERR_DNS_LOOKUP_FAILED` | The DNS query failed for a network-related reason.                                        |
| `1005` | `ERR_FALLBACK_FAILED`   | The `.well-known` fallback failed or returned invalid data.                               |

### **2.4. Exposing Multiple Protocols (Non-Normative Guidance)**

The canonical location for discovery is the base record: `_agent.<domain>`. Providers **MAY** additionally expose distinct agent services (e.g., one for MCP and one for A2A) on protocol-specific subdomains using the underscore form `_agent._<proto>.<domain>`.

**Examples:**

```dns
_agent._mcp.example.com. 300 IN TXT "v=aid1;p=mcp;uri=..."
_agent._a2a.example.com. 300 IN TXT "v=aid1;p=a2a;uri=..."
```

**Client behavior:**

- By default, clients query the base `_agent.<domain>`.
- When a specific protocol is explicitly requested (by the application), clients **MAY** first query the protocol-specific subdomain `_agent._<proto>.<domain>` and, if not found, fall back to the base record.
- Providers that publish only the base record remain fully compliant.

---

## **3. Security Rules**

- **DNSSEC:** Providers are **STRONGLY ENCOURAGED** to sign their DNS records with DNSSEC. Vercel-registered apex domains (including `agentcommunity.org`) are DNSSEC-signed by default. Clients **SHOULD** validate the `RRSIG` when the zone advertises it for the `_agent` record.
- **HTTPS:** A `remote` agent's `uri` **MUST** use `https://`. Clients **MUST** perform standard TLS certificate and hostname validation.
- **No Secrets:** The TXT record is public and **MUST NOT** contain any secrets.
- **Endpoint Proof (PKA):** When the record includes `pka`/`k`, clients **MUST** verify server control of the private key using HTTP Message Signatures (RFC 9421) with Ed25519 (Appendix D). Providers **MUST** publish `kid`/`i` when `pka` is present. Clients **SHOULD** warn on downgrade if a domain removes `pka` after prior discovery.
- **Local Execution (`proto=local`) Safeguards:** Clients that support local execution **MUST** implement the following:
  1.  **Explicit Consent:** Before the first execution, the client **MUST** display the full, resolved command to the user and require explicit confirmation.
  2.  **Integrity Check:** The client **MUST** compute and cache a cryptographic fingerprint of the `uri` and `proto` values. If these values change on a subsequent lookup, the client **MUST** re-trigger the full consent process.
  3.  **No Shell Interpretation:** Arguments derived from the `uri` **MUST** be passed atomically to the underlying OS execution call to prevent command injection.
  4.  **No Nested Discovery:** Clients **MUST** reject a `local` execution `uri` that could be interpreted as a command initiating another AID discovery request.
  5.  **Sandboxing:** Clients **SHOULD** run local agents within a sandboxed environment with minimum necessary permissions.
- **Redirect Handling:** If an initial request to the discovered `uri` returns an HTTP redirect (`301`, `302`, `307`, or `308`) **to a different origin** (hostname or port), the client **SHOULD** treat this as a potential security risk. Clients **MUST NOT** follow such cross-origin redirects automatically. Implementations MAY either  
  a. terminate with `ERR_SECURITY`, or  
  b. require explicit user confirmation before proceeding.

---

## **4. DNS and Caching**

- **Provider TTL:** It is **RECOMMENDED** that providers set a Time-To-Live (TTL) of **300–900 seconds (5–15 minutes)** on their `_agent.<domain>` TXT record.
- **Client Caching:** Clients **MUST** respect the TTL of the DNS record they receive and **MUST NOT** cache the record for longer.

---

## **5. Future Path**

- **SRV/HTTPS Record Upgrade:** AID v2 is planned to use `SRV` records ([RFC2782]) for a more structured discovery mechanism. The service name will be `_agent._tcp`. Until ratified, TXT lookup remains the canonical method for v1.
- **IANA Registration:** A formal request for the `_agent` service name will be submitted to IANA as per [RFC6335].

---

## **6. Registries and Governance**

To ensure interoperability, token registries and community resources are maintained publicly.

- **Token Registries:** The canonical lists for `auth` and `proto` tokens are maintained at:
  [https://github.com/agentcommunity/aid-tokens](https://github.com/agentcommunity/aid-tokens)
  Additions require a pull request and are governed by a "First Come, First Served" policy with expert review.
- **Global Index:** An open DNS crawler and community dashboard showcasing AID adoption is maintained at:
  [https://github.com/agentcommunity/aid-registry](https://github.com/agentcommunity/aid-registry)

---

## **Appendix A: Authentication Scheme Registry (`auth`)**

_All scheme tokens are case-sensitive and defined in lowercase ASCII._

- `none`
- `pat` (Personal Access Token)
- `apikey`
- `basic` (HTTP Basic Authentication)
- `oauth2_device`
- `oauth2_code`
- `mtls`
- `custom`

## **Appendix B: Protocol Registry (`proto` / `p`)**

_All protocol tokens are case-sensitive and defined in lowercase ASCII._

| Token       | Meaning                                         | Allowed `uri` scheme(s)   |
| ----------- | ----------------------------------------------- | ------------------------- |
| `mcp`       | Model Context Protocol                          | `https://`                |
| `a2a`       | Agent-to-Agent Protocol                         | `https://`                |
| `openapi`   | URI points to an OpenAPI specification document | `https://`                |
| `grpc`      | gRPC over HTTP/2 or HTTP/3                      | `https://`                |
| `graphql`   | GraphQL over HTTP                               | `https://`                |
| `websocket` | WebSocket transport                             | `wss://`                  |
| `local`     | The agent runs locally on the client machine    | `docker:`, `npx:`, `pip:` |
| `zeroconf`  | mDNS/DNS-SD service discovery                   | `zeroconf:<service_type>` |
| `ucp`       | Universal Commerce Protocol                     | `https://`                |

## **Appendix C: Client Error Constants**

For cross-language SDK consistency, clients **SHOULD** use these numeric constants when throwing errors.

| Constant                | Value  |
| ----------------------- | ------ |
| `ERR_NO_RECORD`         | `1000` |
| `ERR_INVALID_TXT`       | `1001` |
| `ERR_UNSUPPORTED_PROTO` | `1002` |
| `ERR_SECURITY`          | `1003` |
| `ERR_DNS_LOOKUP_FAILED` | `1004` |
| `ERR_FALLBACK_FAILED`   | `1005` |

## **Appendix D: PKA Handshake (Normative)**

When `pka`/`k` is present, clients MUST verify control of the private key. Use HTTP Message Signatures (RFC 9421) with Ed25519.

Pseudocode (client):

```
function performPKAHandshake(uri, pka, kid):
    nonce = generateRandomBytes(32)
    challenge = base64urlEncode(nonce)
    headers = {
        "AID-Challenge": challenge,
        "Date": currentUTCTime()
    }
    response = sendGET(uri, headers)

    if response.status != 200:
        failWith(ERR_SECURITY)

    sigInput = response.headers["Signature-Input"]
    signature = response.headers["Signature"]

    created = parseCreated(sigInput)
    if |currentTime() - created| > 300 seconds:
        failWith(ERR_SECURITY)

    pubKey = multibaseDecode(pka)
    if not verifyEd25519(signature, sigInput.coveredFields, pubKey):
        failWith(ERR_SECURITY)
```

Providers MUST include `kid`/`i` with `pka`/`k`. Clients SHOULD warn on downgrade if a previously present `pka` is removed.

## **Appendix E: .well-known Fallback (Non-Normative)**

- Path: `GET https://<domain>/.well-known/agent`
- Format: JSON that mirrors TXT keys, including aliases.
- Security: Relies on TLS certificate validation. PKA still applies when present.
- Client algorithm: Use DNS first. Fallback only on `ERR_NO_RECORD` or `ERR_DNS_LOOKUP_FAILED`.
- Errors: Use `ERR_FALLBACK_FAILED` when the fallback fails or is invalid.

## **References**

- [RFC1035] Domain Names - Implementation and Specification
- [RFC2119] Key words for use in RFCs to Indicate Requirement Levels
- [RFC2782] A DNS RR for specifying the location of services (DNS SRV)
- [RFC5890] Internationalized Domain Names for Applications (IDNA)
- [RFC8174] Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words
- [RFC9460] Service Binding and Parameter Specification (SVCB/HTTPS)

---

**Next Steps:**

- [Quick Start Guide](quickstart/index.md)
- [aid-doctor CLI Reference](Tooling/aid_doctor.md) – Official implementation and validation tool
