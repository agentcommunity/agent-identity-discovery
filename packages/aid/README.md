# @agentcommunity/aid

# Agent Identity & Discovery

> DNS for Agents

AID as the public address book for the agentic web.

It's a simple, open standard that uses the internet's own directory—DNS—to answer one question: **"Given a domain, where is its AI agent, and how do I know it's the real one?"**

No more hunting through API docs. No more manual configuration. It's the zero-friction layer for a world of interconnected agents.

Built by the team at [agentcommunity.org](https://agentcommunity.org).

- **Website**: [aid.agentcommunity.org](https://aid.agentcommunity.org)
- **Docs**: [docs.agentcommunity.org/aid](https://docs.agentcommunity.org/aid)
- **GitHub**: [github.com/agent-community/agent-identity-discovery](https://github.com/agent-community/agent-identity-discovery)

## Install

```bash
pnpm add @agentcommunity/aid
# or
npm install @agentcommunity/aid
# or
yarn add @agentcommunity/aid
```

## Quick Start (Node.js)

```ts
import { discover, AidError } from '@agentcommunity/aid';

try {
  const { record, ttl, queryName } = await discover('example.com');
  console.log('Found', record.proto, 'at', record.uri, 'TTL:', ttl, 'query:', queryName);
} catch (e) {
  if (e instanceof AidError) {
    console.error(`AID Error (${e.code})`, e.errorCode, e.message);
  } else {
    console.error('Unexpected error', e);
  }
}
```

## Quick Start (Browser)

```ts
import { discover } from '@agentcommunity/aid/browser';

const { record } = await discover('example.com');
console.log('Agent:', record.proto, record.uri);
```

## API

- `discover(domain: string, options?)` → `{ record, ttl, queryName }`
  - Node uses DNS; Browser uses DNS-over-HTTPS.
  - Canonical query is `_agent.<domain>`. When a specific protocol is requested, clients may query `_agent._<proto>.<domain>` as an optimization.
- `parse(txt: string)` → validated AID record
- `AidError` – error class exposing `code` (numeric) and `errorCode` (symbol)
- Constants and types exported from `@agentcommunity/aid`

## v1.2 Notes (PKA + .well-known)

- New fields: `pka` (`k`) and `kid` (`i`). When a record includes `pka`, the client performs a Public Key for Agent (PKA) handshake using HTTP Message Signatures (Ed25519).
- `pka` is a multibase string using base58btc (`z...`) of the raw 32‑byte Ed25519 public key.
- Handshake coverage: required fields are `"AID-Challenge" "@method" "@target-uri" "host" "date"`.
- Time window: both `created` and HTTP `Date` must be within ±300 seconds of now.
- Fallback: when DNS has `ERR_NO_RECORD` or `ERR_DNS_LOOKUP_FAILED`, discovery may fetch `https://<domain>/.well-known/agent` (TLS‑anchored) and validate the same data model; if the JSON contains `pka`, the handshake runs.

### PKA handshake expectations (summary)

- Covered fields set (exact): `"AID-Challenge" "@method" "@target-uri" "host" "date"`
- `alg="ed25519"`
- `keyid` equals record `kid` (normalize quotes for compare, preserve raw in base)
- `created` ± 300 seconds of current time
- HTTP `Date` ± 300 seconds of current time
- `pka` is multibase base58btc (`z...`) of a 32‑byte Ed25519 public key

### Dev‑only loopback relax (well‑known)

For local testing against a mock HTTP server, the CLI and Node variant support a narrow, opt‑in relaxation:

- Set `AID_ALLOW_INSECURE_WELL_KNOWN=1`
- Host must be loopback (`localhost`, `127.0.0.1`, or `::1`)
- Only affects `.well-known` fallback; TXT path remains strict
- Validation is performed with a temporary `https://` substitute, and the discovered `http://` URI is restored afterward

This is intended for local development only. Production remote agents MUST use `https://`.

### Example: guarded `.well-known` fallback

```ts
import { discover } from '@agentcommunity/aid';

const { record, queryName } = await discover('example.com', {
  wellKnownFallback: true,
  wellKnownTimeoutMs: 2000,
});

console.log('Query:', queryName); // either DNS name or https://<domain>/.well-known/agent
```

PKA handshake runs automatically when `record.pka` is present.

## Error Codes

- `1000` `ERR_NO_RECORD` – no `_agent` TXT found
- `1001` `ERR_INVALID_TXT` – malformed record
- `1002` `ERR_UNSUPPORTED_PROTO` – protocol not supported
- `1003` `ERR_SECURITY` – security policy violation
- `1004` `ERR_DNS_LOOKUP_FAILED` – DNS lookup failed
- `1005` `ERR_FALLBACK_FAILED` – `.well‑known` fallback failed or invalid

## Security Notes

- Remote agent URIs MUST use `https://`.
- Handshake verifies endpoint control when `pka` is present (Ed25519 HTTP Message Signatures).
- `.well-known` is optional and TLS‑anchored; use DNS first.

### Redirect Security

Clients do not automatically follow cross‑origin redirects from the discovered URI. If an initial request returns a 301/302/307/308 to a different origin (hostname or port), the client treats it as a potential security risk. Implementations either surface `ERR_SECURITY` or require explicit confirmation. See the spec for details.

### More on PKA

See the documentation “Quick Start → PKA handshake expectations” for the exact header coverage, algorithm, timestamps, and key format.

## License

MIT © [Agent Community](https://agentcommunity.org)
