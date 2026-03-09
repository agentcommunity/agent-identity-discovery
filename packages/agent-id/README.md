# agent-id

Short alias for [`@agentcommunity/aid`](https://www.npmjs.com/package/@agentcommunity/aid) — the JS/TS SDK for Agent Identity & Discovery (AID), a DNS-based discovery protocol for AI agents.

## Install

```bash
npm install agent-id
```

## Usage

```ts
import { discover } from 'agent-id';

const { record, ttl } = await discover('example.com');
console.log(record.proto, record.uri);
```

## What is this?

This package re-exports `@agentcommunity/aid`. It exists so you can `import from 'agent-id'` instead of `@agentcommunity/aid`.

Both packages are identical in functionality. Use whichever you prefer.

## What is AID?

Agent Identity & Discovery is a DNS-based protocol that lets any domain advertise agent endpoints via TXT records at `_agent.<domain>`. It supports protocol hints (MCP, A2A, ARDP, etc.), optional cryptographic endpoint verification (PKA), and works with every DNS provider today.

- [AID Specification](https://aid.agentcommunity.org/docs/specification)
- [GitHub](https://github.com/agentcommunity/agent-identity-discovery)
- [Full docs](https://aid.agentcommunity.org)

## License

MIT
