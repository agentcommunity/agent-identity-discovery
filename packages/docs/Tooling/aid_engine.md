---
title: '@agentcommunity/aid-engine'
description: 'Pure business logic library for AID discovery, validation, and PKA'
icon: material/cogs
---

# @agentcommunity/aid-engine

A pure, stateless TypeScript library containing all AID business logic for discovery, validation, and cryptographic verification.

## Overview

`aid-engine` is the core library that implements the AID specification. Unlike `aid-doctor` (the CLI wrapper), this library contains no side effects, file system operations, or user interfaces. It's designed for:

- **Custom integrations** and tools
- **Server-side applications** needing AID functionality
- **Advanced use cases** requiring programmatic access
- **Testing and validation** scenarios

## Installation

```bash
pnpm add @agentcommunity/aid-engine
# or
npm i @agentcommunity/aid-engine
```

## Core Functions

### Discovery

```typescript
import { runCheck } from '@agentcommunity/aid-engine';

const result = await runCheck('example.com', {
  timeoutMs: 5000,
  allowFallback: true,
  wellKnownTimeoutMs: 2000,
  checkDowngrade: false,
});

// Returns a DoctorReport with:
// - DNS resolution details
// - Record validation results
// - TLS certificate information
// - PKA verification status
// - Security checks
```

### Record Generation

```typescript
import { buildTxtRecordVariant } from '@agentcommunity/aid-engine';

const record = buildTxtRecordVariant(
  {
    domain: 'example.com',
    uri: 'https://api.example.com/agent',
    proto: 'mcp',
    auth: 'pat',
    desc: 'Example Agent',
    pka: 'zBase58PublicKey',
    kid: 'g1',
  },
  false,
); // false = full keys, true = aliases

console.log(record);
// "v=aid1;uri=https://api.example.com/agent;proto=mcp;auth=pat;desc=Example Agent;pka=zBase58PublicKey;kid=g1"
```

### Validation

```typescript
import { validateTxtRecord } from '@agentcommunity/aid-engine';

const validation = validateTxtRecord('v=aid1;uri=https://api.example.com/agent;proto=mcp');
console.log(validation.isValid); // true
console.log(validation.errors); // []
```

### PKA Verification

```typescript
import { verifyPka } from '@agentcommunity/aid-engine';

const result = verifyPka('zBase58PublicKey');
console.log(result.valid); // true/false
console.log(result.reason); // error message if invalid
```

## Key Types

### DoctorReport

```typescript
interface DoctorReport {
  domain: string;
  record: RecordBlock;
  queried: QueriedBlock;
  dnssec: DnssecBlock;
  tls: TlsBlock;
  pka: PkaBlock;
  downgrade: DowngradeBlock;
  exitCode: number;
  cacheEntry?: CacheEntry;
}
```

### CheckOptions

```typescript
interface CheckOptions {
  protocol?: string;
  timeoutMs: number;
  allowFallback: boolean;
  wellKnownTimeoutMs: number;
  showDetails?: boolean;
  probeProtoSubdomain?: boolean;
  probeProtoEvenIfBase?: boolean;
  dumpWellKnownPath?: string | null;
  checkDowngrade?: boolean;
  previousCacheEntry?: CacheEntry;
}
```

## When to Use aid-engine vs aid-doctor

### Use aid-engine when you need:

- **Programmatic access** to AID functionality
- **Custom tooling** or integrations
- **Server-side processing** without CLI dependencies
- **Fine-grained control** over discovery options
- **Testing scenarios** requiring pure functions

### Use aid-doctor when you need:

- **Command-line interface** for quick checks
- **Interactive record generation** with prompts
- **Human-readable output** with formatting
- **File system operations** (caching, draft saving)
- **Simple validation** without coding

## Architecture Notes

`aid-engine` is designed with functional programming principles:

- **Pure functions** with no side effects
- **Stateless operations** (no global state)
- **Deterministic behavior** (same inputs = same outputs)
- **Testable logic** (easy to unit test)

The CLI wrapper `aid-doctor` handles:

- User interaction and prompts
- File system caching (`~/.aid/cache.json`)
- PKA key storage (`~/.aid/keys/`)
- Colored output and formatting
- Error handling with exit codes

## Error Handling

```typescript
import { AidError } from '@agentcommunity/aid';

try {
  const result = await runCheck('example.com');
} catch (error) {
  if (error instanceof AidError) {
    console.log('AID Error:', error.code, error.errorCode);
  } else {
    console.log('Unexpected error:', error);
  }
}
```

## Advanced Usage

### Custom DNS Resolution

```typescript
import { runCheck } from '@agentcommunity/aid-engine';

// All options are passed through to the DNS resolver
const result = await runCheck('example.com', {
  timeoutMs: 1000, // Short timeout for fast failure
  allowFallback: false, // Skip .well-known fallback
  checkDowngrade: true, // Enable downgrade detection
  previousCacheEntry: {
    // For downgrade checking
    lastSeen: '2024-01-01T00:00:00Z',
    pka: 'zPreviousKey',
  },
});
```

### Protocol-Specific Probing

```typescript
const result = await runCheck('example.com', {
  protocol: 'mcp', // Hint for protocol-specific subdomain
  probeProtoSubdomain: true, // Try _agent._mcp.example.com first
  probeProtoEvenIfBase: false, // Don't probe if base exists
});
```

## See also

- [aid-doctor CLI](aid_doctor.md) – Command-line interface using this library
- [Specification](../specification.md) – Full AID protocol specification
- [Discovery API](../Reference/discovery_api.md) – Cross-language discovery patterns
