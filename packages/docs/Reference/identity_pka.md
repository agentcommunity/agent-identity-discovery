---
title: 'Identity & PKA'
description: 'Optional endpoint proof and rotation for AID v1.1'
icon: material/shield-lock-outline
---

[View spec appendix](../specification.md#appendix-d-pka-handshake-normative)

## Identity & PKA (ELI5)

- **Problem:** DNS tells you where to go, but how do you know the server there is the right one?
- **Answer:** The domain publishes a public key. On first contact, the server proves it owns the matching private key by signing a small challenge. Your client checks the signature.
- **Result:** You get a simple, extra layer of trust on top of TLS, without changing DNS. Conceptually similar to “pkarr”-style public‑key anchored identity, wrapped into AID.

## What “PKA” Means

PKA stands for **P**ublic **K**ey for **A**gent.

- **PKA:** A public key (`pka`/`k`) advertised in the `_agent.<domain>` record.
- **kid:** A Key ID (`kid`/`i`) used to label and rotate keys.

## Relationship to Pkarr

The PKA mechanism is heavily inspired by [Pkarr](https://pkarr.org/) (Public Key Addressable Resource Records), a standard for creating sovereign identities using public keys.

**Shared Philosophy:** Like Pkarr, AID believes that a public key is the ultimate root of a decentralized identity. Both protocols aim to create a verifiable link between an identity and the online resources it controls.

**The Key Difference: Simplicity and Deployability.** Where Pkarr uses a Distributed Hash Table (DHT) for maximum censorship resistance, PKA integrates the public key directly into the AID DNS record. This was a deliberate design choice that aligns with AID's core principle of **Pragmatism over Purity**. By leveraging existing, universal DNS infrastructure, PKA provides a robust identity verification layer that any domain owner can deploy _today_, without needing to run or rely on DHT relays.

In short, PKA applies the powerful identity philosophy of Pkarr with the pragmatic, "works everywhere" delivery mechanism of AID.

## How it works (high level)

1. The TXT record includes `k` (or `pka`) with a multibase Ed25519 public key and an `i` (or `kid`) label.
2. The client makes the first request with an `AID-Challenge` header and a `Date`.
3. The server responds with HTTP Message Signatures (RFC 9421) headers that cover the challenge, method, target URI, host, and date.
4. The client verifies the signature with the published public key. If it matches and the timestamp is fresh (≈5 minutes), trust is established.

## Example TXT

```text
_agent.example.com. 300 IN TXT "v=aid1;p=mcp;u=https://api.example.com/mcp;k=z7rW8r...;i=g1"
```

## Technical details (concise)

- Key: Ed25519, multibase (z/base58btc) encoded in `k`/`pka`.
- Proof: HTTP Message Signatures (RFC 9421). Client sends `AID-Challenge`; server returns `Signature-Input` and `Signature`.
- Covered fields: `AID-Challenge`, `@method`, `@target-uri`, `host`, `date`.
- Freshness: Reject if the `created` timestamp is too old or too far in the future (±300s typical).
- Rotation: Change keys by publishing a new `k` with a new `i` (kid). Keep old key available until clients have seen the new one.
- Downgrade warnings: If `k`/`pka` disappears after being present, clients should warn.
- Together with TLS (required) and DNSSEC (recommended), PKA creates defense‑in‑depth.

## When to require PKA

- High‑trust/enterprise connections
- Admin/control planes
- Any scenario where DNS spoofing would be high‑impact

## Operations checklist

- Publish `k` and `i` in the TXT record.
- Store the private key securely; plan rotation via `kid`.
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

- Spec appendix: [PKA Handshake](../specification.md#appendix-d-pka-handshake-normative)
- [Security Best Practices](security.md)
- [Rationale](../Understand/rationale.md)
