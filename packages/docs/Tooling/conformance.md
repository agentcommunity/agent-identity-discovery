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

## ModelMarket interop

Open the [ModelMarket interop test](https://aid.agentcommunity.org/interop/modelmarket)
and select **Run checks**. It verifies three live AID endpoint-proof responses and
checks the MCP server card against the digest in ModelMarket's ARD catalog.
Copy the JSON report to share the outcome and the proof headers.

See the [interop proposal in the IETF DAWN archive](https://mailarchive.ietf.org/arch/msg/dawn/OIP8iMn_X-JSh_3ZgtBARvNl3eo/)
and [ModelMarket's reply](https://mailarchive.ietf.org/arch/msg/dawn/aDirdCx-wqEVap7zUtM1fUvC31Q/).

From a checkout with dependencies installed, run the same checks locally:

```bash
pnpm -C packages/aid build
pnpm --silent -C packages/web interop:modelmarket
```

The command prints the report as JSON and exits with status 1 if a check fails.
The stale endpoint and stale digest cases use local fixtures.

## See also

- [Quick Start index](../quickstart/index.md)
- [Protocols & Auth Tokens](../Reference/protocols.md)
- [Troubleshooting](../Reference/troubleshooting.md)
