---
title: 'Identity & PKA'
description: 'Optional endpoint proof for AID v2 and v1 compatibility'
icon: material/shield-lock-outline
---

[Read the implementer reference](pka.md) or the [normative specification appendix](../specification.md#appendix-b-pka-handshake).

## Identity & PKA (ELI5)

- **Problem:** DNS tells you where to go, but how do you know the server there is the right one?
- **Answer:** The domain publishes a public key. On first contact, the server proves it owns the matching private key by signing a small challenge. Your client checks the signature.
- **Result:** You get a simple, extra layer of endpoint proof on top of TLS, rooted in the domain owner's DNS record.

## What “PKA” Means

PKA stands for **P**ublic **K**ey for **A**gent.

- **PKA:** A public key (`pka`/`k`) advertised in the `_agent.<domain>` record.
- **v2 key:** `k` is the unpadded base64url Ed25519 JWK `x` value.
- **v2 keyid:** The HTTP signature `keyid` is the RFC 7638 JWK thumbprint derived from `k`.
- **v1 compatibility:** Legacy `aid1` PKA uses `k=z...` base58btc and an explicit `i`/`kid`.

## Relationship to Pkarr

AID PKA and [Pkarr](https://pkarr.org/) both use compact Ed25519 public keys, but they make different trust claims.

Pkarr is public-key-rooted: the key is the address and signs resource records under that key.

AID is DNS-authority-rooted: the domain owner publishes the current endpoint and current endpoint-proof key in `_agent.<domain>`. PKA proves that the reached endpoint controls the private key for the DNS-current public key. It does not make the public key the domain's address, and it does not create cryptographic continuity across key changes.

That boundary is intentional. AID stays deployable through ordinary DNS while giving clients a narrow endpoint proof they can compose with TLS, DNSSEC, authorization, and policy layers.

## Historical Background

The Agent Community blog post [External Identity Anchors](https://agentcommunity.org/blog/external_identity_anchor) explains the security problem PKA addresses: first-contact endpoint proof without assuming a registry, federation, connector, or prior integration.

That post predates the AID v2 wire format. Treat it as background for the identity model, not as implementation guidance. Current `aid2` records use unpadded base64url Ed25519 JWK `x` values, RFC 7638-derived `keyid`, RFC 9421 `nonce`, mandatory `expires`, and no signed HTTP `Date`.

## How it works (high level)

1. The TXT record includes `k` (or `pka`) with the current Ed25519 public key.
2. The client derives the RFC 7638 JWK thumbprint keyid from `k`.
3. The client sends an RFC 9421 response-signature challenge with a fresh `nonce`.
4. The server responds with HTTP Message Signatures (RFC 9421) headers that cover the request context and response status.
5. The client verifies the signature with the published public key. If it matches, the nonce is echoed, and the response is fresh, endpoint proof succeeds.

## Example TXT

```text
_agent.example.com. 300 IN TXT "v=aid2;p=mcp;u=https://api.example.com/mcp;k=JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs"
```

## Technical details (concise)

- Key: Ed25519, unpadded base64url JWK `x` encoded in `k`/`pka`.
- Key identity: RFC 7638 JWK thumbprint over `{"crv":"Ed25519","kty":"OKP","x":"<k>"}`.
- Proof: HTTP Message Signatures (RFC 9421). Client requests a nonce-bound response signature; server returns `Signature-Input` and `Signature`.
- Full handshake details: see [PKA Endpoint Proof](pka.md).
- Rotation: AID v2 core publishes the current key. It does not define DNS-level rotation labels. Returning clients can detect a changed key by comparing derived thumbprints.
- Downgrade warnings: If `k`/`pka` disappears after being present, clients should warn.
- Together with TLS (required) and DNSSEC (recommended), PKA creates defense in depth.

## Domain Binding

PKA alone proves that the reached endpoint controls the private key in the DNS record. It does not prove the endpoint consents to serve as the agent for the queried domain — any domain can publish another operator's endpoint URI and key, creating an _unauthorized association_ that passes endpoint proof (see [§3.1 of the spec](../specification.md#31-what-pka-proves)).

The domain-binding profile addresses this. When `k` is present in an `aid2` record, v2 clients **SHOULD** send the `AID-Domain` request header containing the queried domain, and request the extended response signature that covers `"aid-domain";req` (the tag stays `aid-pka-v2`). This is the default for v2 clients unless `domain-binding=off` is set locally (see [§3.3](../specification.md#33-enterprise-policy-modes)).

When the endpoint returns a response covering `"aid-domain";req` that passes verification, the discovery result carries `domainBound: true`. When the endpoint returns the base unbound proof (covered set without `aid-domain`), the result carries `domainBound: false`.

> **Important:** requesting domain binding is not itself a mitigation. An attacker-controlled endpoint can ignore `AID-Domain` and return a valid unbound proof. Only `domain-binding=require` — which rejects unbound proofs — enforces the protection. See [§3.3](../specification.md#33-enterprise-policy-modes).

To enforce hard domain-binding, set `domain-binding=require` in enterprise policy. This causes discovery to fail with `ERR_SECURITY` when the proof is unbound or when the endpoint refuses with `403`.

Full protocol detail is in [Specification Appendix B.7](../specification.md#b7-domain-binding).

## v1 compatibility

Legacy `aid1` records remain valid during the compatibility window:

```text
_agent.example.com. 300 IN TXT "v=aid1;p=mcp;u=https://api.example.com/mcp;k=z7rW8r...;i=g1"
```

For `aid1`, `k` is multibase `z...` base58btc, `i`/`kid` is required with `k`, the client sends `AID-Challenge` and `Date`, and the signature `keyid` must match DNS `kid`.

## When to require PKA

- High‑trust/enterprise connections
- Admin/control planes
- Any scenario where DNS spoofing would be high‑impact

## Operations checklist

- Publish `k` in the TXT record. For new v2 records, do not publish `i`/`kid`.
- Store the private key securely.
- Track the derived RFC 7638 thumbprint in deployment notes so planned key replacement is distinguishable from an unexpected change.
- For legacy v1 compatibility records, keep publishing `i`/`kid` with `k`.
- Monitor for downgrade: if you remove `k`, expect client warnings.
- Document your contact/docs URL via `d` (docs) and deprecation timeline via `e` (dep) as needed.
- Use the [aid-doctor CLI](../Tooling/aid_doctor.md) `pka` commands to generate and verify PKA keys.

## Why PKA Instead of a DID Scheme?

Decentralized Identifiers (DIDs) are a powerful and important standard for the future of the web. We evaluated supporting a generic DID scheme (e.g., `did:key` or `did:web`) and concluded that the focused PKA approach is better for the specific goal of AID: simple, immediately deployable endpoint proof.

Our decision was based on AID's core philosophy of **Pragmatism over Purity**.

1.  **Minimalism and Reduced Complexity.** PKA is just one key-value pair with a clear purpose. Supporting the full DID standard would require clients to implement complex and often heavy DID resolver logic. This introduces significant dependencies and contradicts AID's minimal endpoint-discovery role. PKA verifies endpoint key possession with a fraction of the implementation cost.

2.  **No New Infrastructure Required.** PKA works entirely within the existing DNS infrastructure that AID is already built on. Many DID methods rely on new, specialized, or opinionated infrastructure, such as blockchains or specific resolver networks. Governing, maintaining, and securing this new infrastructure is a massive undertaking that distracts from the core goal of providing a simple identity system that just works.

3.  **Self-Contained and Immediately Usable.** With PKA, the AID record carries the current endpoint-proof key. The client performs one lookup and gets what it needs to verify the endpoint. Many DID methods require further network lookups to retrieve the full DID Document, adding latency and points of failure.

In short, PKA provides a DNS-published public key for endpoint proof while intentionally avoiding the operational complexity and infrastructural brittleness of the broader DID ecosystem. Future profiles can compose AID with specific DID methods without making DIDs part of v2 core.

## See also

- [PKA Endpoint Proof](pka.md)
- [Specification Appendix B](../specification.md#appendix-b-pka-handshake)
- [Security Best Practices](security.md)
- [Rationale](../Understand/rationale.md)
- [External Identity Anchors](https://agentcommunity.org/blog/external_identity_anchor) - historical background, pre-v2 wire format
