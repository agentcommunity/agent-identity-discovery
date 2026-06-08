---
title: 'SDKs and Packages'
description: 'Package map for AID SDKs, tooling, and the web workbench.'
icon: material/package-variant-closed

extra_css_class: aid-page
---

# SDKs and Packages

AID keeps the public package names stable across the v2 transition. New records should use `aid2`; clients keep `aid1` compatibility during the migration window.

## Packages

| Package                                                                                                  | Purpose                                                                | Language   |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| [`@agentcommunity/aid`](https://www.npmjs.com/package/@agentcommunity/aid)                               | Main discovery SDK for Node.js and browser clients                     | TypeScript |
| [`@agentcommunity/aid-engine`](https://www.npmjs.com/package/@agentcommunity/aid-engine)                 | Pure discovery, validation, and PKA logic with no network side effects | TypeScript |
| [`@agentcommunity/aid-doctor`](https://www.npmjs.com/package/@agentcommunity/aid-doctor)                 | CLI for record generation, validation, diagnostics, and PKA helpers    | Node.js    |
| [`aid-discovery`](https://pypi.org/project/aid-discovery/)                                               | Python discovery library                                               | Python     |
| [`aid-go`](https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-go)         | Go discovery library                                                   | Go         |
| [`aid-rs`](https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-rs)         | Rust parser and discovery library, with optional PKA handshake support | Rust       |
| [`aid-dotnet`](https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-dotnet) | .NET parser, discovery, PKA, and `.well-known` support                 | .NET       |
| [`aid-java`](https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-java)     | Java parser, discovery, PKA, and `.well-known` support                 | Java       |
| [Web Workbench](https://aid.agentcommunity.org/workbench)                                                | Browser generator and resolver for AID records                         | Web        |

## Shared Contract

Constants across SDKs are generated from `protocol/constants.yml`. After protocol constant changes, run:

```bash
pnpm gen
```

Generated outputs include the canonical TypeScript spec module, web mirror, and example records used by the workbench and showcase Terraform.

## See Also

- [Quick Start](../quickstart/index.md)
- [Discovery API](discovery_api.md)
- [aid-doctor CLI](../Tooling/aid_doctor.md)
- [Specification](../specification.md)
