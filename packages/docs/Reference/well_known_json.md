---
title: '.well-known JSON'
description: 'Fallback JSON payload, client guardrails, and TTL policy'
icon: material/file-code
---

# .well-known JSON

Clients may fall back to a JSON document at `/.well-known/agent` only when DNS discovery fails with `ERR_NO_RECORD` or `ERR_DNS_LOOKUP_FAILED`.

## Path

- URL: `GET https://<domain>/.well-known/agent`
- HTTPS only. No redirects.
- Content-Type must start with `application/json`.
- Response body ≤ 64 KB.

## Canonical JSON example

```json
{
  "v": "aid2",
  "u": "https://api.example.com/mcp",
  "p": "mcp",
  "s": "Example Agent",
  "d": "https://docs.example.com/agent",
  "k": "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs"
}
```

The document mirrors TXT keys and supports single-letter aliases (`v,u,p,s,a,d,e,k`). Clients canonicalize aliases to their full names and parse using the same validation rules as TXT.

Legacy `aid1` fallback JSON remains valid during the compatibility window. For `aid1` PKA, include `k=z...` and `i`/`kid`.

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
- PKA rules still apply if `k` is present. In v2, the HTTP signature `keyid` is derived from `k`; in legacy v1, `i`/`kid` is required with `k`.
- Test your `.well-known` implementation using the [aid-doctor CLI](../Tooling/aid_doctor.md) with the `--dump-well-known` flag.

## See also

- [Discovery API](./discovery_api.md)
- [Specification](../specification.md)
- [Troubleshooting](./troubleshooting.md)
