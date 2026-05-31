---
title: 'Identity & PKA'
description: 'Optional endpoint proof for AID v2 and v1 compatibility'
icon: material/shield-lock-outline
---

[View v2 explainer](../specification_v2_explained.md#appendix-b-pka-handshake) or the [v1.2 spec appendix](../specification.md#appendix-d-pka-handshake-normative).

## Identity & PKA (ELI5)

- **Problem:** DNS tells you where to go, but how do you know the server there is the right one?
- **Answer:** The domain publishes a public key. On first contact, the server proves it owns the matching private key by signing a small challenge. Your client checks the signature.
- **Result:** You get a simple, extra layer of trust on top of TLS, without changing DNS. Conceptually similar to “pkarr”-style public‑key anchored identity, wrapped into AID.

## What “PKA” Means

PKA stands for **P**ublic **K**ey for **A**gent.

- **PKA:** A public key (`pka`/`k`) advertised in the `_agent.<domain>` record.
- **v2 key:** `k` is the unpadded base64url Ed25519 JWK `x` value.
- **v2 keyid:** The HTTP signature `keyid` is the RFC 7638 JWK thumbprint derived from `k`.
- **v1 compatibility:** Legacy `aid1` PKA uses `k=z...` base58btc and an explicit `i`/`kid`.

## Relationship to Pkarr

The PKA mechanism is heavily inspired by [Pkarr](https://pkarr.org/) (Public Key Addressable Resource Records), a standard for creating sovereign identities using public keys.

**Shared Philosophy:** Like Pkarr, AID believes that a public key is the ultimate root of a decentralized identity. Both protocols aim to create a verifiable link between an identity and the online resources it controls.

**The Key Difference: Simplicity and Deployability.** Where Pkarr uses a Distributed Hash Table (DHT) for maximum censorship resistance, PKA integrates the public key directly into the AID DNS record. This was a deliberate design choice that aligns with AID's core principle of **Pragmatism over Purity**. By leveraging existing, universal DNS infrastructure, PKA provides a robust identity verification layer that any domain owner can deploy _today_, without needing to run or rely on DHT relays.

In short, PKA applies the powerful identity philosophy of Pkarr with the pragmatic, "works everywhere" delivery mechanism of AID.

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
- Covered fields: `"@method";req`, `"@target-uri";req`, `"@authority";req`, and `"@status"`.
- Freshness: `created` and `expires` are mandatory and short-lived. HTTP `Date` is not signed in v2.
- Rotation: AID v2 core publishes the current key. It does not define DNS-level rotation labels. Returning clients can detect a changed key by comparing derived thumbprints.
- Downgrade warnings: If `k`/`pka` disappears after being present, clients should warn.
- Together with TLS (required) and DNSSEC (recommended), PKA creates defense in depth.

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

Decentralized Identifiers (DIDs) are a powerful and important standard for the future of the web. We evaluated supporting a generic DID scheme (e.g., `did:key` or `did:web`) and concluded that the focused PKA approach is superior for the specific goal of AID: providing a simple, immediately deployable **identity bootstrap layer**.

Our decision was based on AID's core philosophy of **Pragmatism over Purity**.

1.  **Minimalism and Reduced Complexity.** PKA is just one key-value pair with a clear purpose. Supporting the full DID standard would require clients to implement complex and often heavy DID resolver logic. This introduces significant dependencies and contradicts AID's "minimal bootstrap" philosophy. PKA delivers the core value of verifiable identity with a fraction of the implementation cost.

2.  **No New Infrastructure Required.** PKA works entirely within the existing DNS infrastructure that AID is already built on. Many DID methods rely on new, specialized, or opinionated infrastructure, such as blockchains or specific resolver networks. Governing, maintaining, and securing this new infrastructure is a massive undertaking that distracts from the core goal of providing a simple identity system that just works.

3.  **Self-Contained and Immediately Usable.** With PKA, the AID record is a complete, self-contained "identity document" for the agent. The client performs one lookup and gets everything it needs to verify the endpoint. Many DID methods require further network lookups to retrieve the full DID Document, adding latency and points of failure.

In short, PKA provides the most critical value of a DID—a verifiable, decentralized public key—while intentionally avoiding the operational complexity and infrastructural brittleness of the broader DID ecosystem. It is the "80/20" solution that perfectly fits the AID philosophy, with a clear path to potentially supporting specific, well-established DID methods in the future as the ecosystem matures.

## See also

- v2 explainer: [PKA Handshake](../specification_v2_explained.md#appendix-b-pka-handshake)
- v1.2 spec appendix: [PKA Handshake](../specification.md#appendix-d-pka-handshake-normative)
- [Security Best Practices](security.md)
- [Rationale](../Understand/rationale.md)
