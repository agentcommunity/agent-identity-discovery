---
title: '@agentcommunity/aid-engine'
description: 'Core TypeScript library for AID discovery diagnostics, validation, and PKA'
icon: material/cogs
---

# @agentcommunity/aid-engine

A reusable TypeScript core library for AID validation, record generation, discovery diagnostics, and cryptographic verification.

## Overview

`aid-engine` is the core library that implements AID validation, record generation, discovery diagnostics, and cryptographic verification. Unlike `aid-doctor` (the CLI wrapper), this library has no CLI prompts, process exits, filesystem cache writes, or user interface concerns.

`runCheck` intentionally performs network I/O for discovery diagnostics: DNS-over-HTTPS, optional `.well-known` fallback, TLS inspection, DNSSEC probing, and PKA verification. Pure helper functions such as `validateTxtRecord`, `buildTxtRecordVariant`, and `verifyPka` remain deterministic and side-effect free.

It's designed for:

- **Custom integrations** and tools
- **Server-side applications** needing AID functionality
- **Advanced use cases** requiring programmatic access
- **Testing and validation** scenarios without CLI prompts or filesystem cache writes

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

const record = buildTxtRecordVariant({
  domain: 'example.com',
  uri: 'https://api.example.com/agent',
  proto: 'mcp',
  auth: 'pat',
  desc: 'Example Agent',
  pka: 'JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs',
}); // Canonical v2 output uses short keys

console.log(record);
// "v=aid2;u=https://api.example.com/agent;p=mcp;a=pat;s=Example Agent;k=JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs"
```

### Validation

```typescript
import { validateTxtRecord } from '@agentcommunity/aid-engine';

const validation = validateTxtRecord('v=aid2;u=https://api.example.com/agent;p=mcp');
console.log(validation.isValid); // true
console.log(validation.error); // undefined when valid, message string when invalid
```

### PKA Verification

```typescript
import { verifyPka } from '@agentcommunity/aid-engine';

const result = verifyPka('JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs');
console.log(result.valid); // true/false
console.log(result.reason); // error message if invalid
```

## Key Types

### DoctorReport

```typescript
interface DoctorReport {
  domain: string;
  queried: QueriedBlock;
  record: RecordBlock;
  dnssec: DnssecBlock;
  tls: TlsBlock;
  pka: PkaBlock;
  downgrade: DowngradeBlock;
  exitCode: number;
  cacheEntry: CacheEntry | null;
}
```

### CheckOptions

```typescript
interface CheckOptions {
  protocol?: string;
  timeoutMs: number;
  allowFallback: boolean;
  wellKnownTimeoutMs: number;
  securityMode?: 'balanced' | 'strict';
  dnssecPolicy?: 'off' | 'prefer' | 'require';
  pkaPolicy?: 'if-present' | 'require';
  downgradePolicy?: 'off' | 'warn' | 'fail';
  wellKnownPolicy?: 'auto' | 'disable';
  domainBindingPolicy?: 'off' | 'prefer' | 'require';
  previousSecurity?: PreviousSecurityState;
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
- **Testing scenarios** that need engine helpers without CLI prompts or filesystem cache writes

### Use aid-doctor when you need:

- **Command-line interface** for quick checks
- **Interactive record generation** with prompts
- **Human-readable output** with formatting
- **File system operations** (caching, draft saving)
- **Simple validation** without coding

## Architecture Notes

`aid-engine` keeps the boundary between reusable core logic and the CLI wrapper clear:

- **No CLI or filesystem side effects** in the engine
- **Explicit network diagnostics** in `runCheck` for DNS, `.well-known`, TLS, DNSSEC, and PKA
- **Pure helper functions** for record validation, generation, and key-format checks
- **Stateless operations** where callers provide previous security/cache state explicitly

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
  const result = await runCheck('example.com', {
    timeoutMs: 5000,
    allowFallback: true,
    wellKnownTimeoutMs: 2000,
  });
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
    lastSeen: '2026-05-01T00:00:00.000Z',
    version: 'aid2',
    trustSource: 'dns',
    pka: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    kid: null,
    keyid: 'ogRZbCR5KTrPFCAfuYmCMwj0w7Yuk3Lr6YWQWfpkbf0',
    jwkX: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    hash: null,
  },
});
```

### Protocol-Specific Probing

`aid-engine` diagnostics are base-first. The `protocol` option labels the requested protocol in the report, but the primary lookup remains `_agent.<domain>`.

```typescript
const result = await runCheck('example.com', {
  protocol: 'mcp', // Hint for protocol-specific subdomain
  probeProtoSubdomain: true, // After base failure, probe _agent._mcp.example.com for diagnostics
  probeProtoEvenIfBase: false, // Set true to probe after base success and warn on drift
});
```

## See also

- [aid-doctor CLI](aid_doctor.md) – Command-line interface using this library
- [Specification](../specification.md) – Full AID protocol specification
- [Discovery API](../Reference/discovery_api.md) – Cross-language discovery patterns
