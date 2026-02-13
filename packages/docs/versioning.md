---
title: 'Versioning'
description: 'How the AID specification evolves.'
icon: material/git

extra_css_class: aid-page
---

[View raw markdown](https://github.com/agentcommunity/agent-identity-discovery/raw/main/packages/docs/versioning.md)

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
- **Minor Versions (e.g., v1.1.0):** Reserved for new, non-breaking features that are backward-compatible. For example, adding a new _optional_ key to the `TXT` record would be a minor release. Implementers can adopt these features at their own pace.
- **Patch Versions (e.g., v1.0.1):** Used for clarifications, typo fixes, and documentation improvements that do not change the protocol's behavior. These are backward-compatible by definition.

## Changelog

A detailed, human-readable changelog will be maintained for each release. The changelog documents all changes, big or small, providing a clear history of the standard's evolution.

You can find the full changelog here:
[**View the Official Changelog**](changelog.md)

## Our Philosophy on Stability

We believe a discovery protocol must be exceptionally stable. Our commitment to you is:

1.  **Breaking Changes are Rare:** Major version bumps will be infrequent and will only be made when there is a significant, community-vetted reason to do so.
2.  **Clarity Through Communication:** Any upcoming minor or major changes will be discussed openly in the community repository before being finalized.
3.  **The v1 Standard is a Long-Term Foundation:** The `aid1` specification is designed to be a durable, long-term solution. You can build on it with confidence.
