---
title: '.well-known JSON'
description: 'Canonical JSON payload, client guardrails, and TTL policy'
icon: material/file-code
---

# .well-known JSON (v1.1)

Clients may fall back to a JSON document at `/.well-known/agent` only when DNS discovery fails with `ERR_NO_RECORD` or `ERR_DNS_LOOKUP_FAILED`.

## Path

- URL: `GET https://<domain>/.well-known/agent`
- HTTPS only. No redirects.
- Content-Type must start with `application/json`.
- Response body ≤ 64 KB.

## Canonical JSON example

```json
{
  "v": "aid1",
  "u": "https://api.example.com/mcp",
  "p": "mcp",
  "s": "Example Agent",
  "d": "https://docs.example.com/agent",
  "k": "zBase58PublicKey",
  "i": "g1"
}
```

The document mirrors TXT keys and supports single-letter aliases (`v,u,p,s,a,d,e,k,i`). Clients canonicalize aliases to their full names and parse using the same validation rules as TXT.

## Client guardrails

- HTTPS required; clients must not relax scheme for remote protocols.
- Do not follow redirects when fetching this path.
- Enforce `Content-Type` guard (`application/json` prefix) and 64 KB size limit.
- On success, TTL is treated as `DNS_TTL_MIN` (300 seconds).

## Loopback relax (development only)

- Only for well-known path, never for TXT.
- Must be explicitly enabled per language (env/flag) and limited to loopback hosts (`localhost`, `127.0.0.1`, `::1`).

## Errors

- Use `ERR_FALLBACK_FAILED` for fetch/validation failures.
- PKA rules still apply if `k`/`i` are present (see PKA handshake expectations).
- Test your `.well-known` implementation using the [aid-doctor CLI](../Tooling/aid_doctor.md) with the `--dump-well-known` flag.

## See also

- [Discovery API](./discovery_api.md)
- [Specification](../specification.md)
- [Troubleshooting](./troubleshooting.md)
