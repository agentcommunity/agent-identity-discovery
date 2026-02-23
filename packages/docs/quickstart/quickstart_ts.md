---
title: 'TypeScript / Node.js'
description: 'Discover agents by domain using @agentcommunity/aid (Node.js)'
icon: material/language-typescript
---

# TypeScript / Node.js

## Install

```bash
pnpm add @agentcommunity/aid
# or
npm i @agentcommunity/aid
```

## Discover by Domain

```ts
import { discover, AidError } from '@agentcommunity/aid';

async function main() {
  try {
    const { record, ttl, queryName } = await discover('supabase.agentcommunity.org');
    console.log('proto:', record.proto); // mcp | openapi | a2a | local
    console.log('uri:', record.uri); // https://...
    console.log('desc:', record.desc); // optional
    console.log('ttl:', ttl, 'query:', queryName);
  } catch (e) {
    if (e instanceof AidError) console.error(e.code, e.errorCode, e.message);
    else console.error(e);
  }
}

main();
```

## Options

```ts
// Hint protocol-specific subdomain (tries _agent._mcp.<domain> first):
await discover('example.com', { protocol: 'mcp' });

// Timeout (ms, Node only):
await discover('example.com', { timeout: 7000 });

// Guarded .well-known fallback (Node only)
await discover('example.com', { wellKnownFallback: true });

// Independent well-known timeout (ms, Node only)
await discover('example.com', { wellKnownTimeoutMs: 2000 });
```

## Parse a Raw TXT Record

```ts
import { parse } from '@agentcommunity/aid';

const rec = parse('v=aid1;uri=https://api.example.com/mcp;proto=mcp;desc=Example');
console.log(rec.proto, rec.uri);
```

Notes

- Use `proto` (preferred) or shorthand `p`. Do not set both.
- Remote protocols must use `https://`. Local uses allowed custom schemes.
- Errors are standardized (`1000..1005`).

> **Advanced Usage**: For building custom tools, use `@agentcommunity/aid-engine` - a pure, stateless library containing all AID business logic without CLI dependencies.

---

**Next:** [Browser](quickstart_browser.md) | [Protocols & Auth](../Reference/protocols.md) | [Troubleshooting](../Reference/troubleshooting.md)
