---
title: 'Go'
description: 'Discover agents using the Go library'
icon: material/language-go
---

# Go

## Install

```bash
go get -u github.com/agentcommunity/agent-identity-discovery/aid-go
```

## Discover by Domain

```go
package main

import (
    "fmt"
    "log"
    "time"

    aid "github.com/agentcommunity/agent-identity-discovery/aid-go"
)

func main() {
    rec, ttl, err := aid.Discover("supabase.agentcommunity.org", 5*time.Second)
    if err != nil { log.Fatal(err) }
    fmt.Println(rec.Proto, rec.URI, rec.Desc, ttl)
}
```

## Options

Protocol-specific DNS flow and guarded `.well-known` fallback:

```go
rec, ttl, err := aid.DiscoverWithOptions(
    "example.com",
    5*time.Second,
    aid.DiscoveryOptions{
        Protocol:          "mcp",       // tries _agent._mcp., then _agent.mcp., then base
        WellKnownFallback: true,         // only on ERR_NO_RECORD / ERR_DNS_LOOKUP_FAILED
        WellKnownTimeout:  2 * time.Second,
    },
)
```

Notes

- TTL uses DNS value when available; for `.well-known` fallback, TTL is treated as 300.
- PKA handshake runs automatically when `pka`/`kid` are present.

## Parse Raw TXT

```go
rec, err := aid.Parse("v=aid1;u=https://api.example.com/mcp;p=mcp;s=Example")
if err != nil { /* handle */ }
fmt.Println(rec.URI)
```

Errors map to symbolic codes (e.g., `ERR_NO_RECORD`) and numeric codes (1000..1005).

---

**Next:** [Python](quickstart_python.md) | [Protocols & Auth](../Reference/protocols.md) | [Troubleshooting](../Reference/troubleshooting.md)
