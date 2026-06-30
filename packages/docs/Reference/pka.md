---
title: 'PKA Endpoint Proof'
description: 'Implementer reference for AID v2 Public Key for Agent endpoint proof.'
icon: material/shield-key-outline

extra_css_class: aid-page
---

# PKA Endpoint Proof

Public Key for Agent (PKA) is AID's optional endpoint-proof profile. It lets a client verify that the endpoint discovered from DNS controls the Ed25519 private key matching the public key in the selected AID record.

PKA proves endpoint key possession. It does not authenticate a user, authorize an action, issue a token, prove workload identity, or describe capabilities.

For the normative protocol text, see [Specification Appendix B](../specification.md#appendix-b-pka-handshake). This page expands that appendix into an implementer checklist.

## Inputs

A verifier starts with a selected `aid2` record:

```text
v=aid2;u=https://api.example.com/mcp;p=mcp;k=ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ
```

The `k` value is the unpadded base64url Ed25519 JWK `x` member. It must decode to exactly 32 bytes.

The matching JWK shape is:

```json
{ "kty": "OKP", "crv": "Ed25519", "x": "<k>" }
```

## Derived Key Identity

For `aid2`, DNS does not publish `kid` or `i`. The expected HTTP signature `keyid` is derived from `k` with RFC 7638.

Hash this exact UTF-8 JSON serialization:

```text
{"crv":"Ed25519","kty":"OKP","x":"<k>"}
```

Then encode the SHA-256 digest as unpadded base64url. Do not hash the raw public key bytes directly.

For the example key above, the expected `keyid` is:

```text
WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk
```

## Verifier Algorithm

1. Decode `k` as unpadded base64url and require 32 bytes.
2. Derive the expected RFC 7638 JWK thumbprint from `k`.
3. Generate a nonce with at least 32 bytes of entropy. Unpadded base64url is recommended for transport.
4. Send a PKA request to the discovered `u` value. Remove fragments, preserve query strings, and do not follow redirects.
5. Include `Accept-Signature` requesting the AID profile shown below.
6. Include `Cache-Control: no-store`.
7. Parse `Signature-Input` and `Signature` from the response.
8. Require the covered components, `tag`, `keyid`, `alg`, `nonce`, `created`, `expires`, and response `Cache-Control` rules below.
9. Reconstruct the RFC 9421 signature base from the received Structured Field values.
10. Verify the Ed25519 signature with the public key from DNS `k`.

## Request And Response

Client request header:

```http
Accept-Signature: aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created;expires;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
Cache-Control: no-store
```

Server response headers:

```http
Signature-Input: aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created=<unix>;expires=<unix>;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
Signature: aid-pka=:<base64-signature>:
Cache-Control: no-store
```

The signature must not cover HTTP `Date`.

## Covered Components

The base AID v2 PKA signature covers exactly:

- `"@method";req`
- `"@target-uri";req`
- `"@authority";req`
- `"@status"`

`@method`, `@target-uri`, and `@authority` are request-derived and therefore use `;req`. `@status` is response-derived and does not use `;req`. The domain-binding profile below extends this base covered set with `"aid-domain";req`; the tag remains `aid-pka-v2`.

A signed non-`200` status can still prove endpoint authenticity. For example, a signed `401` can prove the endpoint before the OAuth or auth.md layer continues.

## URI And Authority

The request context is based on the discovered endpoint URI:

- remove the fragment;
- preserve the query string;
- lowercase the hostname;
- omit default ports;
- retain non-default ports;
- reject redirects during PKA verification.

Servers behind reverse proxies must sign the externally visible request context, not internal hop-local host, scheme, or port values.

## Freshness And Caching

`created` and `expires` are mandatory.

- `expires` must be greater than `created`.
- `expires - created` must not exceed 300 seconds.
- `expires - created` should be 60 seconds or less.
- Verifiers may allow small clock skew.
- The received `nonce` must exactly match the verifier's challenge.
- PKA requests and responses use `Cache-Control: no-store`.

Servers do not need nonce storage in v2 core because the verifier supplies a one-shot nonce, the response is short-lived, and the response is not cacheable.

## Rejection Checklist

Reject the PKA response when any of these are true:

- the selected record is not `aid2`;
- `k` is missing, padded, not base64url, or not 32 decoded bytes;
- the response follows a redirect;
- `Signature-Input` or `Signature` is missing or malformed;
- covered components differ from the AID profile (either the four base components, or those four plus the optional `"aid-domain";req` — see Domain Binding Profile below);
- `tag` is not `aid-pka-v2`;
- `keyid` differs from the RFC 7638 thumbprint derived from DNS `k`;
- `alg` is not semantically `ed25519`;
- `nonce` differs from the challenge;
- `created` or `expires` is missing or outside the freshness policy;
- response `Cache-Control: no-store` is missing;
- Ed25519 verification fails over the reconstructed signature base.

## Domain Binding Profile

The base PKA profile proves endpoint key possession but does not prove the endpoint consents to serve as agent for the queried domain. The domain-binding profile (Appendix B.7) closes that gap.

### AID-Domain header

When `k` is present in an `aid2` record, the client **SHOULD** send:

```http
AID-Domain: example.com
```

The value is the queried domain from step 1 of the discovery algorithm: A-label form, lowercased, no trailing dot, no port. This is the same value used in Section 2.3 step 1 of the spec.

### Extended request shape

The tag stays `aid-pka-v2`; the client requests domain binding by adding `"aid-domain";req` to the covered set:

```http
AID-Domain: example.com
Accept-Signature: aid-pka=("@method";req "@target-uri";req "@authority";req "aid-domain";req "@status");created;expires;keyid="<jwk-thumbprint>";alg="ed25519";nonce="<client-challenge>";tag="aid-pka-v2"
Cache-Control: no-store
```

The additional covered component is `"aid-domain";req` — the `aid-domain` request header, per RFC 9421 component identifier rules. Because the covered set lives in the signed `@signature-params`, coverage of `aid-domain` is authenticated; a single tag suffices for both unbound and domain-bound proofs.

### Server response shape

A server that supports this profile and serves the named domain responds with the Appendix B.3 shape, except the covered set includes `"aid-domain";req`. A server that does not support domain binding ignores `AID-Domain` and responds with the base covered set (no `aid-domain`), which remains a valid unbound proof.

A server that supports this profile but does not serve the named domain MUST NOT produce a signature covering that `AID-Domain` value. It SHOULD respond `403` with no `Signature-Input`. A `403` refusal is a failed endpoint proof, so discovery fails for that domain.

### Domain-binding verifier rules

In addition to the Appendix B.6 checklist:

1. A response is domain-bound if and only if its covered set includes `"aid-domain";req`, constructed from the exact `AID-Domain` value the client sent. The covered set MUST be either the four base components or those four plus `"aid-domain";req` (between `"@authority";req` and `"@status"`) — nothing else.
2. A client that did not send `AID-Domain` MUST reject a response whose covered set includes `aid-domain` (fail-closed).

### domainBound indicator

Clients that request domain binding MUST expose a boolean `domainBound` field in PKA state:

- `true` when a valid proof covering `"aid-domain";req` was verified for the queried domain.
- `false` when the verified proof omits `aid-domain` (unbound).

### Rejection checklist additions

Add these checks when `AID-Domain` was sent:

- the covered set includes `aid-domain` but `"aid-domain";req` does not match the exact `AID-Domain` value the client sent — reject.
- the covered set includes `aid-domain` but the client did not send `AID-Domain` — reject.
- `domain-binding=require` is active and the verified proof is unbound (covered set omits `aid-domain`) — fail with `ERR_SECURITY`.

See [Specification Appendix B.7](../specification.md#b7-domain-binding) for the normative text.

## Canonical Test Vector

The repository ships a canonical vector at `protocol/pka_vectors.json` with id `v2-rfc9421-response-signature`. It includes the `aid2` record, `k`, derived JWK thumbprint, nonce, request headers, response headers, signature base, and Ed25519 signature.

Use that vector before claiming independent PKA compatibility.

## Legacy Aid1 Compatibility

Legacy `aid1` PKA remains available only for compatibility clients during the migration window. It uses `k=z...` base58btc, requires `i`/`kid`, carries the challenge through `AID-Challenge`, and includes HTTP `Date` in the legacy covered set.

Do not apply those legacy rules to `aid2` records.

## See Also

- [Identity & PKA](identity_pka.md)
- [Security](security.md)
- [Specification Appendix B](../specification.md#appendix-b-pka-handshake)
- [aid-doctor CLI](../Tooling/aid_doctor.md)
- [External Identity Anchors](https://agentcommunity.org/blog/external_identity_anchor) - historical background, pre-v2 wire format
