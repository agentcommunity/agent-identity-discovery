---
title: 'Python'
description: 'Discover agents using the Python package'
icon: material/language-python
---

# Python

## Install

```bash
pip install aid-discovery
```

## Discover by Domain

```python
from aid_py import discover, AidError

try:
    result = discover("supabase.agentcommunity.org")
    print(result.record.proto, result.record.uri, result.record.desc, result.ttl)
except AidError as e:
    print(e.code, e)
```

## Options

```python
from aid_py import discover

# Protocol-specific DNS flow
rec, ttl = discover("example.com", protocol="mcp", timeout=5.0)

# Guarded .well-known fallback (default True) and timeout (seconds)
rec, ttl = discover(
    "example.com",
    well_known_fallback=True,
    well_known_timeout=2.0,
)

# Optional camelCase kwargs (non-breaking, emits deprecation warnings):
rec, ttl = discover(
    "example.com",
    wellKnownFallback=True,
    wellKnownTimeoutMs=2000,
)
```

## Parse Raw TXT

```python
from aid_py import parse
rec = parse("v=aid1;uri=https://api.example.com/mcp;proto=mcp;desc=Example")
print(rec.uri)
```

Notes

- PKA handshake runs automatically when `pka`/`kid` are present.
- Package is published on PyPI as `aid-discovery`.

---

**Next:** [Go](quickstart_go.md) | [Protocols & Auth](../Reference/protocols.md) | [Troubleshooting](../Reference/troubleshooting.md)
