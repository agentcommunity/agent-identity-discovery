# @agentcommunity/aid-engine

# Agent Identity & Discovery

> DNS for agents

AID as the public address book for the agentic web.

It's a simple, open standard that uses the internet's own directory—DNS—to answer one question: **"Given a domain, where is its AI agent, and how do I know it's the real one?"**

No more hunting through API docs. No more manual configuration. It's the zero-friction layer for a world of interconnected agents.

Built by the team at [agentcommunity.org](https://agentcommunity.org).

- **Website**: [aid.agentcommunity.org](https://aid.agentcommunity.org)
- **Docs**: [docs.agentcommunity.org/aid](https://docs.agentcommunity.org/aid)
- **GitHub**: [github.com/agentcommunity/agent-identity-discovery](https://github.com/agentcommunity/agent-identity-discovery)

## What is AID?

AID is a minimal, open standard that answers: **"Given a domain name, where is its AI agent?"**

It uses a single DNS `TXT` record to make any agent service instantly discoverable. No more digging through API docs or manual configuration.

## Overview

`@agentcommunity/aid-engine` is the **pure business logic** library that powers the AID ecosystem. Unlike the CLI wrapper (`@agentcommunity/aid-doctor`), this library contains:

- ✅ **No side effects** (no filesystem, no network I/O beyond DNS/well-known)
- ✅ **Pure functions** with deterministic behavior
- ✅ **Stateless operations** (no global state)
- ✅ **Comprehensive test coverage** (25+ tests)
- ✅ **Easy to test** and integrate

## Install

```bash
pnpm add @agentcommunity/aid-engine
# or
npm install @agentcommunity/aid-engine
# or
yarn add @agentcommunity/aid-engine
```

## Quick Start

```typescript
import {
  runCheck,
  validateTxtRecord,
  buildTxtRecordVariant,
  verifyPka,
} from '@agentcommunity/aid-engine';

try {
  // Discover and validate an AID record
  const result = await runCheck('example.com', {
    timeoutMs: 5000,
    allowFallback: true,
    wellKnownTimeoutMs: 2000,
  });

  console.log('Found', result.record.proto, 'agent at', result.record.uri);

  // Validate a TXT record string
  const validation = validateTxtRecord('v=aid2;u=https://api.example.com/agent;p=mcp');
  console.log('Valid:', validation.isValid);

  // Build the canonical short-key TXT form
  const record = buildTxtRecordVariant({
    domain: 'example.com',
    uri: 'https://api.example.com/agent',
    proto: 'mcp',
    auth: 'pat',
  }); // Canonical v2 output uses short keys

  console.log('TXT record:', record);

  // Verify a PKA public key
  const pkaResult = verifyPka('ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ');
  console.log('PKA valid:', pkaResult.valid);
} catch (error) {
  console.error('AID error:', error.message);
}
```

## Core Functions

### Discovery & Validation

```typescript
import { runCheck, type CheckOptions } from '@agentcommunity/aid-engine';

const options: CheckOptions = {
  protocol: 'mcp', // Optional protocol hint
  timeoutMs: 5000, // DNS timeout
  allowFallback: true, // Enable .well-known fallback
  wellKnownTimeoutMs: 2000, // HTTP timeout for fallback
  showDetails: true, // Include TLS/PKA details
  probeProtoSubdomain: true, // Query _agent.<domain> first; probe _agent._<proto>.<domain> only for diagnostics/base failure
};

const result = await runCheck('example.com', options);
```

### Record Generation

```typescript
import { buildTxtRecordVariant, type AidGeneratorData } from '@agentcommunity/aid-engine';

const data: AidGeneratorData = {
  domain: 'example.com',
  uri: 'https://api.example.com/agent',
  proto: 'mcp',
  auth: 'pat',
  desc: 'Example Agent',
  pka: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ', // aid2 PKA
};

// Canonical short-key output: v=aid2;u=...;p=...
const record = buildTxtRecordVariant(data);
```

### Validation

```typescript
import { validateTxtRecord } from '@agentcommunity/aid-engine';

const result = validateTxtRecord('v=aid2;u=https://api.example.com/agent;p=mcp');

if (result.isValid) {
  console.log('✅ Valid AID record');
} else {
  console.log('❌ Invalid:', result.error);
}
```

### PKA Key Management

```typescript
import { verifyPka, generateEd25519KeyPair } from '@agentcommunity/aid-engine';

// Verify a PKA public key
const verification = verifyPka('ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ');

// Generate a new key pair (pure function)
const { publicKey, privateKeyPem } = await generateEd25519KeyPair();
```

## Key Features

### ✅ DNS-First Discovery

- Canonical `_agent.<domain>` TXT record lookup
- Protocol-specific subdomain probing (`_agent._<proto>.<domain>`)
- IDNA/Punycode domain normalization

### ✅ Security Built-In (v2 default)

- **PKA Handshake**: aid2 uses Ed25519 HTTP Message Signatures with RFC 9421 nonce, derived JWK thumbprint `keyid`, `created`, `expires`, and response `Cache-Control: no-store`
- **TLS Validation**: Certificate chain verification and expiry warnings
- **DNSSEC Presence**: RRSIG detection for integrity verification
- **Redirect Policy**: Cross-origin redirect protection

### ✅ Well-Known Fallback

- HTTPS-only `.well-known/agent` JSON fallback
- Content-Type validation and size limits (≤64KB)
- Automatic TXT record conversion from JSON

### ✅ Multi-Protocol Support

- MCP (Model Context Protocol)
- A2A (Agent-to-Agent Protocol)
- OpenAPI, GraphQL, gRPC, WebSocket
- Local protocols (Docker, npx, pip)
- Zeroconf (mDNS/DNS-SD)

### ✅ v2 Default and v1 Compatibility

- `aid2` endpoint proof uses `pka`/`k` as unpadded base64url Ed25519 JWK `x`
- DNS `kid`/`i` is not emitted for `aid2`; the key id is derived as the RFC 7638 JWK thumbprint
- Legacy `aid1` compatibility can still read `k=z...` base58btc with `i`/`kid`, `AID-Challenge`, signed `Date`, and `keyid` matching DNS `kid`
- `docs` field for documentation URLs
- `dep` field for deprecation warnings
- Alias support (`v`,`u`,`p`,`a`,`s`,`d`,`e`,`k`; legacy `aid1` also uses `i`)

## When to Use aid-engine

### ✅ Use aid-engine when you need:

- **Custom tooling** or integrations
- **Server-side processing** without CLI dependencies
- **Programmatic access** to AID functionality
- **Fine-grained control** over discovery options
- **Testing scenarios** requiring pure functions

### 🔄 Use aid-doctor when you need:

- **Command-line interface** for quick checks
- **Interactive record generation** with prompts
- **Human-readable output** with formatting
- **File system operations** (caching, key storage)
- **Simple validation** without coding

## Error Handling

```typescript
import { runCheck, AidError } from '@agentcommunity/aid-engine';

try {
  const result = await runCheck('example.com');
  // Success - result.exitCode === 0
} catch (error) {
  if (error instanceof AidError) {
    console.error(`AID Error (${error.code}): ${error.message}`);
    console.error(`Error Code: ${error.errorCode}`);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Error Codes

| Code | Error Code              | Description                         |
| ---- | ----------------------- | ----------------------------------- |
| 1000 | `ERR_NO_RECORD`         | No `_agent` TXT record found        |
| 1001 | `ERR_INVALID_TXT`       | Malformed or invalid TXT record     |
| 1002 | `ERR_UNSUPPORTED_PROTO` | Protocol not supported by client    |
| 1003 | `ERR_SECURITY`          | Security policy violation (PKA/TLS) |
| 1004 | `ERR_DNS_LOOKUP_FAILED` | DNS query failed                    |
| 1005 | `ERR_FALLBACK_FAILED`   | `.well-known` fallback failed       |

## Architecture

`aid-engine` follows functional programming principles:

- **Pure Functions**: No side effects, deterministic behavior
- **Stateless**: No global state or mutable shared data
- **Testable**: Easy to unit test with predictable inputs/outputs
- **Composable**: Functions can be combined for complex workflows

The CLI wrapper (`aid-doctor`) handles:

- User interaction and prompts
- File system caching (`~/.aid/cache.json`)
- PKA key storage (`~/.aid/keys/`)
- Colored output and formatting

## Development

```bash
# Build
pnpm build

# Test
pnpm test

# Lint
pnpm lint
```

## Related Packages

- **@agentcommunity/aid**: Core TypeScript library (Node.js + Browser)
- **@agentcommunity/aid-doctor**: CLI wrapper using this engine
- **@agentcommunity/aid-conformance**: Shared test fixtures

## License

MIT © [Agent Community](https://agentcommunity.org)
