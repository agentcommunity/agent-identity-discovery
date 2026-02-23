---
title: 'Versioning'
description: 'How the AID specification evolves.'
icon: material/git

extra_css_class: aid-page
---

[View raw markdown](https://github.com/agentcommunity/agent-identity-discovery/raw/main/packages/docs/Reference/versioning.md)

# Versioning and Changelog

The Agent Identity & Discovery (AID) standard is designed to be a stable, living protocol. To ensure predictability for implementers while allowing for future improvements, we follow a clear and simple versioning strategy based on **Semantic Versioning (SemVer)** principles.

## The `v` Key in the TXT Record

The `v` key within an AID `TXT` record (e.g., `v=aid1`) signifies the **major version** of the specification that the record conforms to.

- **`v=aid1`**: This corresponds to the entire v1.x.x series of the specification defined in this documentation.
- **Breaking Changes:** Any change that is not backward-compatible with the `v=aid1` rules (e.g., adding a new required key, changing the record name structure, or moving to SRV records) will result in a new major version, `v=aid2`.
- **Client Behavior:** A client that only understands `aid1` **MUST** ignore any record that does not have `v=aid1`.

## Specification Updates and Releases

The AID specification and its surrounding tooling (libraries, validators) are versioned using Git tags in the official repository.

- **Major Versions (e.g., v2.0.0):** Reserved for breaking changes to the protocol, requiring a new `v` key (e.g., `v=aid2`). These will be accompanied by a major update to the documentation.
- **Minor Versions (e.g., v1.2.0):** Reserved for new, non-breaking features that are backward-compatible. For example, adding a new _optional_ key to the `TXT` record would be a minor release. Implementers can adopt these features at their own pace.
- **Patch Versions (e.g., v1.0.1):** Used for clarifications, typo fixes, and documentation improvements that do not change the protocol's behavior. These are backward-compatible by definition.

## Version History

### v1.1.0 — August 2025

- **Public Key Attestation (PKA):** Optional Ed25519 endpoint proof via HTTP Message Signatures (RFC 9421)
- **Key aliases:** Single-letter aliases for all TXT record keys (`v`, `p`, `u`, `s`, `a`, `d`, `e`, `k`, `i`) for byte efficiency
- **Metadata keys:** `docs`/`d` for documentation URL, `dep`/`e` for deprecation timestamp
- **Protocol extensions:** Added `grpc`, `graphql`, `websocket`, `zeroconf`, and `ucp` protocol tokens
- **`.well-known` fallback:** JSON-based fallback at `/.well-known/agent` for providers without DNS control
- **Protocol-specific subdomains:** Non-normative guidance for `_agent._<proto>.<domain>`

### v1.0.0 — Initial Release

- Core TXT record format at `_agent.<domain>` with `v`, `uri`, `proto`, `auth`, `desc` keys
- Discovery algorithm with DNS lookup, parsing, and validation
- Error codes: `ERR_DNS_LOOKUP_FAILED`, `ERR_NO_RECORD`, `ERR_INVALID_TXT`, `ERR_UNSUPPORTED_PROTO`, `ERR_SECURITY`
- Protocol tokens: `mcp`, `a2a`, `openapi`, `local`
- Auth hints: `none`, `apikey`, `pat`, `basic`, `mtls`, `oauth2_code`, `oauth2_device`, `custom`

### Documentation Updates — August 2025

- v1.1 docs finalized: aliases, metadata, protocol extensions, `.well-known` fallback, and PKA
- New page: [Identity & PKA](identity_pka.md) with ELI5 and technical details
- New page: [aid-doctor CLI](../Tooling/aid_doctor.md) — Complete guide to the validation and generation tool
- New section: [Understand](../Understand/concepts.md) — Concepts, FAQ, and comparison guides

For full technical changes, see the [Specification](../specification.md).

## Our Philosophy on Stability

We believe a discovery protocol must be exceptionally stable. Our commitment to you is:

1.  **Breaking Changes are Rare:** Major version bumps will be infrequent and will only be made when there is a significant, community-vetted reason to do so.
2.  **Clarity Through Communication:** Any upcoming minor or major changes will be discussed openly in the community repository before being finalized.
3.  **The v1 Standard is a Long-Term Foundation:** The `aid1` specification is designed to be a durable, long-term solution. You can build on it with confidence.
