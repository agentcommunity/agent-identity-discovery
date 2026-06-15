---
title: 'Quick Start'
description: 'Publish and discover your first agent in minutes.'
icon: material/rocket-launch

extra_css_class: aid-page
---

# Quick Start

AID is the 0-th hop for agent discovery. Start with a domain, publish one `_agent` TXT record, and clients can find the endpoint, protocol, and optional endpoint proof key.

Use this page for the happy path. Deeper field rules live in the [Specification](../specification.md), SDK details live in [SDKs and Packages](../Reference/packages.md), and PKA mechanics live in [PKA Endpoint Proof](../Reference/pka.md).

## Publish An Agent

Install the CLI:

```bash
npm install -g @agentcommunity/aid-doctor
```

Generate a record interactively:

```bash
aid-doctor generate
# Optional: save the output to a file for later deployment
aid-doctor generate --save-draft /path/to/my-record.txt
```

The wizard prompts for `uri`, `proto`, optional `auth`, `desc`, and other fields, then prints the canonical TXT value and copies it to your clipboard:

```text
v=aid2;u=https://api.example.com/mcp;p=mcp;s=Example AI Tools
```

Publish it in DNS:

| DNS field | Value                                                           |
| --------- | --------------------------------------------------------------- |
| Type      | `TXT`                                                           |
| Name      | `_agent`                                                        |
| Content   | `v=aid2;u=https://api.example.com/mcp;p=mcp;s=Example AI Tools` |
| TTL       | `300`                                                           |

For the full key table, aliases, allowed URI schemes, and metadata rules, see the [current AID v2 specification](../specification.md).

## Verify The Record

After DNS propagates, run:

```bash
aid-doctor check example.com --show-details
```

You can also inspect the raw DNS answer:

```bash
dig TXT _agent.example.com
```

For CI, use JSON output:

```bash
aid-doctor json example.com > aid-result.json
```

## Discover From A Client

Install the TypeScript SDK:

```bash
pnpm add @agentcommunity/aid
```

Discover the endpoint:

```typescript
import { discover } from '@agentcommunity/aid';

const { record } = await discover('example.com');

console.log(record.proto);
console.log(record.uri);
```

Browser clients use the browser entrypoint, which resolves through DNS-over-HTTPS and optional `.well-known` fallback:

```typescript
import { discover } from '@agentcommunity/aid/browser';

const { record } = await discover('example.com');
console.log(record.uri);
```

Language-specific guides:

- [TypeScript / Node.js](./quickstart_ts.md)
- [Browser](./quickstart_browser.md)
- [Go](./quickstart_go.md)
- [Python](./quickstart_python.md)
- [Rust](./quickstart_rust.md)
- [Java](./quickstart_java.md)
- [.NET](./quickstart_dotnet.md)

## Add Endpoint Proof

For production or high-trust deployments, add `k` with an Ed25519 public key:

```text
v=aid2;u=https://api.example.com/mcp;p=mcp;k=ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ
```

When `k` is present, compliant clients perform the AID v2 PKA endpoint-proof handshake before trusting the endpoint. The CLI and SDKs handle the wire details. By default they also send the queried host in the `AID-Domain` header and report a `domainBound` indicator (`true` only for a verified domain-bound proof — one whose `aid-pka-v2` covered set includes `"aid-domain";req`). Requesting binding does not by itself mitigate unauthorized association — only `domain-binding=require` enforces it. See [Specification Appendix B.7](../specification.md#b7-domain-binding).

Read [Identity & PKA](../Reference/identity_pka.md) for the concept and [PKA Endpoint Proof](../Reference/pka.md) for implementation details.

## Next Steps

- [SDKs and Packages](../Reference/packages.md)
- [Discovery API](../Reference/discovery_api.md)
- [Protocols & Auth Tokens](../Reference/protocols.md)
- [Security](../Reference/security.md)
- [Specification](../specification.md)
