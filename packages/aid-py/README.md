# aid-discovery (Python)

> Official Python implementation of the [Agent Identity & Discovery (AID)](https://github.com/agentcommunity/agent-identity-discovery) specification.

[![PyPI version](https://img.shields.io/pypi/v/aid-discovery.svg?color=blue)](https://pypi.org/project/aid-discovery/)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)

AID enables you to discover AI agents by domain name using DNS TXT records. Type a domain, get the agent's endpoint and protocol - that's it.

## Installation

```bash
pip install aid-discovery
```

## Quick Start

```python
from aid_py import discover, AidError

try:
    # discover() returns a (record, ttl) tuple.
    # record is a dict (TypedDict); access fields by key.
    record, ttl = discover("supabase.agentcommunity.org")

    print(f"Protocol: {record['proto']}")          # "mcp"
    print(f"URI: {record['uri']}")                 # "https://api.supabase.com/mcp"
    print(f"Description: {record.get('desc')}")    # "Supabase MCP" (optional)
    print(f"TTL: {ttl} seconds")

    # PKA domain-binding result (True only when an Ed25519 handshake
    # cryptographically bound endpoint control to the queried domain):
    if record.get("domain_bound"):
        print("Endpoint control is bound to this domain")

except AidError as e:
    print(f"Discovery failed: {e}")
```

## API Reference

### `discover(domain: str, *, protocol: str | None = None, timeout: float = 5.0, well_known_fallback: bool = True, well_known_timeout: float = 2.0) -> (dict, int)`

Discovers an agent by looking up the `_agent` TXT record for the exact host you pass in. The resolver does not implicitly retry parent hosts.

**Parameters:**

- `domain` (str): The domain name to discover
- `protocol` (str, optional): Filter for the requested protocol after querying `_agent.<domain>` first. Protocol-specific `_agent._<proto>.<domain>` probing is legacy, diagnostic, or base-failure-only behavior where explicitly supported and configured.
- `timeout` (float): DNS timeout in seconds (default 5.0)
- `well_known_fallback` (bool): If true, falls back to `https://<domain>/.well-known/agent` on `ERR_NO_RECORD` or `ERR_DNS_LOOKUP_FAILED` (default True)
- `well_known_timeout` (float): Timeout for the `.well-known` HTTP fetch (default 2.0)

**Returns:**

- `(record, ttl)` tuple, where:
  - `record` (`dict`): the parsed and validated AID record. Access fields by key (e.g. `record["proto"]`, `record["uri"]`). See [Data Types → `AidRecord`](#aidrecord) for the available keys.
  - `ttl` (`int`): DNS TTL in seconds.

  Unpack it directly: `record, ttl = discover(domain)`.

**Raises:**

- `AidError`: If discovery fails for any reason

### `parse(txt: str) -> AidRecord`

Parses and validates a raw TXT record string.

**Parameters:**

- `txt` (str): Raw TXT record content (e.g., "v=aid2;u=https://...;p=mcp")

**Returns:**

- `AidRecord`: Parsed and validated record (a `dict` / `TypedDict`; access fields by key)

**Raises:**

- `AidError`: If parsing or validation fails

## Data Types

### `AidRecord`

A parsed AID record. At runtime this is a plain `dict` (a `TypedDict`), so access fields by key (`record["proto"]`), not by attribute. Optional fields may be absent — use `record.get("desc")`. Keys:

- `v` (str): Protocol version (`"aid2"`; `"aid1"` is supported for legacy compatibility)
- `uri` (str): Agent endpoint URI
- `proto` (str): Protocol identifier (e.g., `"mcp"`, `"openapi"`)
- `auth` (str, optional): Authentication method
- `desc` (str, optional): Human-readable description
- `docs` (str, optional): Absolute `https://` documentation URL
- `dep` (str, optional): ISO 8601 UTC deprecation timestamp
- `pka` (str, optional): Public key for attestation (base64url)
- `kid` (str, optional): Key id (`aid1` only)
- `domain_bound` (bool, optional): Set by `discover()` after a PKA handshake. `True` when endpoint control was cryptographically bound to the queried domain. Not a TXT-record field — records returned by `parse()` do not include it.

### `AidError`

Exception raised when discovery or parsing fails:

- `code` (int): Numeric error code
- `message` (str): Human-readable error message

## Error Codes

| Code | Symbol                  | Description                   |
| ---- | ----------------------- | ----------------------------- |
| 1000 | `ERR_NO_RECORD`         | No `_agent` TXT record found  |
| 1001 | `ERR_INVALID_TXT`       | Record found but malformed    |
| 1002 | `ERR_UNSUPPORTED_PROTO` | Protocol not supported        |
| 1003 | `ERR_SECURITY`          | Security policy violation     |
| 1004 | `ERR_DNS_LOOKUP_FAILED` | DNS query failed              |
| 1005 | `ERR_FALLBACK_FAILED`   | `.well-known` fallback failed |

## Advanced Usage

### Custom Error Handling

```python
from aid_py import discover, AidError

try:
    record, ttl = discover("example.com")
    # Use record["proto"], record["uri"], ...
except AidError as e:
    if e.code == 1000:  # ERR_NO_RECORD
        print("No agent found for this domain")
    elif e.code == 1001:  # ERR_INVALID_TXT
        print("Found a record but it's malformed")
    else:
        print(f"Other error: {e}")
```

### Parsing Raw Records

```python
from aid_py import parse, AidError

txt_record = "v=aid2;u=https://api.example.com/agent;p=mcp;s=Example Agent"

try:
    record = parse(txt_record)
    print(f"Parsed: {record['proto']} agent at {record['uri']}")
except AidError as e:
    print(f"Invalid record: {e}")
```

### aid2 Notes (PKA + Fallback)

- PKA handshake: For `aid2`, when a record includes `k` (`pka`), the client performs an Ed25519 HTTP Message Signatures handshake to verify endpoint control. The HTTP signature `keyid` is derived from the `aid2` key. `kid` (`i`) is legacy `aid1` compatibility only, not a v2 requirement. This requires an Ed25519 verification backend. Install one of:
  - `pip install aid-discovery[pka]` (installs `cryptography`)
  - Or add `cryptography>=42` or `PyNaCl>=1.5` to your environment (the verifier prefers `PyNaCl` if present and otherwise falls back to `cryptography`)
    If no backend is available, discovery raises `ERR_SECURITY` when PKA is present.

- `.well-known` fallback: On DNS issues (`ERR_NO_RECORD` or `ERR_DNS_LOOKUP_FAILED`), the client may fetch `https://<domain>/.well-known/agent` (TLS-anchored). Disable with `well_known_fallback=False`.

## Redirect Security

Client implementations do not automatically follow cross‑origin redirects from the discovered URI. If an initial request returns a redirect to a different origin (hostname or port), treat it as a potential security risk and either raise an error or require explicit confirmation.

## More on PKA

See the documentation “Quick Start → PKA handshake expectations” for header coverage, algorithm requirements, timestamps, and key format.

## Development

This package is part of the [AID monorepo](https://github.com/agentcommunity/agent-identity-discovery). To run tests:

```bash
# From the monorepo root
pnpm test

# Or run Python tests directly
cd packages/aid-py
python -m pytest tests/
```

## License

MIT - see [LICENSE](https://github.com/agentcommunity/agent-identity-discovery/blob/main/LICENSE) for details.
