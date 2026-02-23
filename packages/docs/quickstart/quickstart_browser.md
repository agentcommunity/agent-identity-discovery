---
title: 'How to — Browser'
description: 'Discover agents in the browser via DNS-over-HTTPS'
icon: material/web
---

# Browser

Uses DNS-over-HTTPS under the hood.

## Install

```bash
pnpm add @agentcommunity/aid
```

## Discover by Domain

```ts
import { discover } from '@agentcommunity/aid/browser';

const { record, ttl } = await discover('supabase.agentcommunity.org');
console.log(record.proto, record.uri, ttl);
```

## Options

```ts
// Hint protocol-specific subdomain first
await discover('example.com', { protocol: 'mcp' });

// Custom DoH endpoint (defaults to Cloudflare)
await discover('example.com', { dohProvider: 'https://dns.google/dns-query' });
```

## Parse Only

```ts
import { parse } from '@agentcommunity/aid';
console.log(parse('v=aid1;u=https://api.example.com/mcp;p=mcp').uri);
```

Security

- Remote URIs must be `https://`.
- Description is limited to 60 UTF-8 bytes.
- `proto` must be one of supported tokens.

---

**Next:** [TypeScript / Node.js](quickstart_ts.md) | [Protocols & Auth](../Reference/protocols.md) | [Troubleshooting](../Reference/troubleshooting.md)
