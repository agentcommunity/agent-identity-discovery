---
title: 'Conformance'
description: 'Shared fixtures and runner for AID parsers'
icon: material/check-decagram
---

# Conformance

Use the shared golden fixtures to verify your parser.

## Package

- NPM: `@agentcommunity/aid-conformance`
- Includes `test-fixtures/golden.json` and a tiny runner.

## Usage (Node/TypeScript)

```ts
import { fixtures } from '@agentcommunity/aid-conformance';
import { parse } from '@agentcommunity/aid';

for (const c of fixtures.records) {
  const record = parse(c.raw);
  // assert deep equality with c.expected
}
```

## CLI runner

```bash
# Default fixtures
npx aid-conformance

# Custom file
npx aid-conformance ./some-fixture.json
```

Exit code is non-zero if any case fails; output includes a concise summary.

!!! tip "Production Validation"
For real-world testing, use the [aid-doctor CLI](aid_doctor.md) to validate your AID records against live DNS and perform security checks.

## See also

- [Quick Start index](../quickstart/index.md)
- [Protocols & Auth Tokens](../Reference/protocols.md)
- [Troubleshooting](../Reference/troubleshooting.md)
