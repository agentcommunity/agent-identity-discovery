# aid-go

> Official Go implementation of the [Agent Identity & Discovery (AID)](https://github.com/agentcommunity/agent-identity-discovery) specification.

[![Go 1.23+](https://img.shields.io/badge/go-1.23+-blue.svg)](https://golang.org/dl/)

AID enables you to discover AI agents by domain name using DNS TXT records. Type a domain, get the agent's endpoint and protocol - that's it.

## Installation

> **Not yet published as a standalone Go module.** Consume the SDK from source (`packages/aid-go`) until the `github.com/agentcommunity/aid-go` module repository and tags are published.

For local source use, add a temporary replace in your consuming module:

```bash
go mod edit -require=github.com/agentcommunity/aid-go@v0.0.0
go mod edit -replace=github.com/agentcommunity/aid-go=../agent-identity-discovery/packages/aid-go
```

## Quick Start

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/agentcommunity/aid-go"
)

func main() {
    // Discover an agent by domain
    record, ttl, err := aid.Discover("supabase.agentcommunity.org", 5*time.Second)
    if err != nil {
        log.Fatalf("Discovery failed: %v", err)
    }

    fmt.Printf("Protocol: %s\n", record.Proto)    // "mcp"
    fmt.Printf("URI: %s\n", record.URI)           // "https://api.supabase.com/mcp"
    fmt.Printf("Description: %s\n", record.Desc)  // "Supabase MCP"
    fmt.Printf("TTL: %d seconds\n", ttl)
}
```

## API Reference

### `func Discover(domain string, timeout time.Duration) (AidRecord, uint32, error)`

Discovers an agent by looking up the `_agent` TXT record for the exact host you pass in. The resolver does not implicitly retry parent hosts.

**Parameters:**

- `domain` (string): The domain name to discover
- `timeout` (time.Duration): Maximum time to wait for DNS resolution

**Returns:**

- `AidRecord`: Parsed and validated record
- `uint32`: DNS TTL in seconds (0 if unavailable)
- `error`: Error if discovery fails

### `func DiscoverWithOptions(domain string, timeout time.Duration, opts DiscoveryOptions) (DiscoveryResult, error)`

Enhanced discovery with protocol-specific DNS lookup and `.well-known` controls, still scoped to the exact host you passed in. Returns a single `DiscoveryResult` struct plus an error.

```go
res, err := aid.DiscoverWithOptions(
    "example.com",
    5*time.Second,
    aid.DiscoveryOptions{
        Protocol:          "mcp",      // queries exact-host base first; protocol-specific probing is diagnostic/base-failure-only where configured
        WellKnownFallback: true,        // only on ERR_NO_RECORD / ERR_DNS_LOOKUP_FAILED
        WellKnownTimeout:  2 * time.Second,
    },
)
if err != nil {
    log.Fatalf("Discovery failed: %v", err)
}

fmt.Printf("Protocol: %s\n", res.Record.Proto)
fmt.Printf("TTL: %d seconds\n", res.TTL)
fmt.Printf("Domain-bound PKA proof: %t\n", res.DomainBound)
```

**Returns:**

- `DiscoveryResult`: Struct with the resolved record and metadata (see below)
- `error`: Error if discovery fails

### `type DiscoveryResult`

Carries the resolved record, its TTL, and whether the PKA handshake produced a domain-bound proof for the queried domain:

```go
type DiscoveryResult struct {
    Record      AidRecord // Parsed and validated record
    TTL         uint32    // DNS TTL in seconds (0 if unavailable)
    DomainBound bool      // true when the PKA handshake proved control of the queried domain
}
```

### `func Parse(txt string) (AidRecord, error)`

Parses and validates a raw TXT record string.

**Parameters:**

- `txt` (string): Raw TXT record content (e.g., "v=aid2;uri=https://...")

**Returns:**

- `AidRecord`: Parsed and validated record
- `error`: Error if parsing or validation fails

### `func ValidateRecord(raw map[string]string) (AidRecord, error)`

Validates a parsed key-value map and returns an AidRecord.

**Parameters:**

- `raw` (map[string]string): Key-value pairs from TXT record

**Returns:**

- `AidRecord`: Validated record
- `error`: Error if validation fails

## Data Types

### `AidRecord`

Represents a parsed AID record:

```go
type AidRecord struct {
    V     string `json:"v"`               // Protocol version ("aid2" by default, "aid1" for legacy compatibility)
    URI   string `json:"uri"`             // Agent endpoint URI
    Proto string `json:"proto"`           // Protocol identifier
    Auth  string `json:"auth,omitempty"`  // Authentication method (optional)
    Desc  string `json:"desc,omitempty"`  // Human-readable description (optional)
    Docs  string `json:"docs,omitempty"`  // Absolute https:// documentation URL (optional)
    Dep   string `json:"dep,omitempty"`   // ISO 8601 UTC deprecation timestamp (optional)
    Pka   string `json:"pka,omitempty"`   // Public Key for Attestation (optional)
    Kid   string `json:"kid,omitempty"`   // Key ID for legacy aid1 PKA; not used by aid2 (optional)
}
```

**Methods:**

- `JSONString() string`: Returns compact JSON representation

### `AidError`

Error type for AID-specific failures:

```go
type AidError struct {
    Symbol string  // Error symbol (e.g., "ERR_NO_RECORD")
    Code   int     // Numeric error code
    Msg    string  // Human-readable message
}
```

**Methods:**

- `Error() string`: Returns formatted error message

## Error Codes

| Code | Symbol                  | Description                                                |
| ---- | ----------------------- | ---------------------------------------------------------- |
| 1000 | `ERR_NO_RECORD`         | No `_agent` TXT record found                               |
| 1001 | `ERR_INVALID_TXT`       | Record found but malformed                                 |
| 1002 | `ERR_UNSUPPORTED_PROTO` | Protocol not supported                                     |
| 1003 | `ERR_SECURITY`          | Security policy violation                                  |
| 1004 | `ERR_DNS_LOOKUP_FAILED` | DNS query failed                                           |
| 1005 | `ERR_FALLBACK_FAILED`   | The `.well-known` fallback failed or returned invalid data |

## Advanced Usage

### Custom Error Handling

```go
package main

import (
    "errors"
    "fmt"
    "time"

    "github.com/agentcommunity/aid-go"
)

func main() {
    record, ttl, err := aid.Discover("example.com", 5*time.Second)
    if err != nil {
        var aidErr *aid.AidError
        if errors.As(err, &aidErr) {
            switch aidErr.Code {
            case aid.ErrNoRecord:
                fmt.Println("No agent found for this domain")
            case aid.ErrInvalidTxt:
                fmt.Println("Found a record but it's malformed")
            default:
                fmt.Printf("AID error: %v\n", aidErr)
            }
        } else {
            fmt.Printf("Other error: %v\n", err)
        }
        return
    }

    // Use record and ttl...
}
```

### Parsing Raw Records

```go
package main

import (
    "fmt"
    "log"

    "github.com/agentcommunity/aid-go"
)

func main() {
    txtRecord := "v=aid2;uri=https://api.example.com/agent;proto=mcp;desc=Example Agent"

    record, err := aid.Parse(txtRecord)
    if err != nil {
        log.Fatalf("Invalid record: %v", err)
    }

    fmt.Printf("Parsed: %s agent at %s\n", record.Proto, record.URI)
    fmt.Printf("JSON: %s\n", record.JSONString())
}
```

### Working with Protocol Constants

```go
package main

import (
    "fmt"

    "github.com/agentcommunity/aid-go"
)

func main() {
    // Check supported protocols
    fmt.Println("Supported protocols:")
    for name, token := range aid.ProtocolTokens {
        fmt.Printf("  %s -> %s\n", name, token)
    }

    // Check supported auth methods
    fmt.Println("Supported auth methods:")
    for name, token := range aid.AuthTokens {
        fmt.Printf("  %s -> %s\n", name, token)
    }

    // Use constants in your code
    if record.Proto == aid.ProtoMcp {
        fmt.Println("This is an MCP agent")
    }
}
```

### Custom DNS Timeout

```go
package main

import (
    "fmt"
    "time"

    "github.com/agentcommunity/aid-go"
)

func main() {
    // Use a longer timeout for slow DNS servers
    record, ttl, err := aid.Discover("example.com", 10*time.Second)
    if err != nil {
        fmt.Printf("Discovery failed: %v\n", err)
        return
    }

    fmt.Printf("Found agent: %s\n", record.JSONString())
    fmt.Printf("Cache for %d seconds\n", ttl)
}
```

## Development

This package is part of the [AID monorepo](https://github.com/agentcommunity/agent-identity-discovery). To run tests:

```bash
# From the monorepo root
pnpm test

# Or run Go tests directly
cd packages/aid-go
go test -v ./...
```

## Dependencies

- `golang.org/x/net` - For IDNA (international domain names) support
- `golang.org/x/text` - Unicode text processing

## License

MIT - see [LICENSE](https://github.com/agentcommunity/agent-identity-discovery/blob/main/LICENSE) for details.

## v2 PKA Default

- PKA handshake: when an `aid2` record includes `pka` (`k`), the client verifies endpoint control using HTTP Message Signatures (RFC 9421) with Ed25519. This package uses Go's `crypto/ed25519` for verification and triggers the handshake automatically during discovery.
- Key format: `k` is the unpadded base64url Ed25519 JWK `x` value.
- Key identity: the HTTP signature `keyid` is the RFC 7638 JWK thumbprint derived from `k`. `aid2` records do not use DNS `kid`/`i`.
- Challenge and freshness: v2 uses `Accept-Signature` with a nonce, mandatory `created` and `expires`, exact nonce echo, and response `Cache-Control: no-store`.

- `.well-known` fallback: When DNS lookup fails (`ERR_NO_RECORD` or `ERR_DNS_LOOKUP_FAILED`), the client fetches `https://<domain>/.well-known/agent` (TLS-anchored) and validates the JSON document (accepts aliases). TTL defaults to `DnsTtlMin` (300s) for this path.

### v2 handshake expectations (summary)

- Base covered fields set: `"@method";req`, `"@target-uri";req`, `"@authority";req`, and `"@status"`
- `alg` must be `ed25519`
- `created` and `expires` define a short validity window
- `keyid` equals the RFC 7638 thumbprint derived from `k`
- `pka` is unpadded base64url for a 32-byte Ed25519 public key

### Domain binding

By default the client sends an `AID-Domain` request header carrying the queried
domain. If the endpoint chooses to bind the proof to that domain, it returns a
signature whose covered set additionally includes `"aid-domain";req` inserted
between `"@authority";req` and `"@status"` (so the covered set is the four base
components plus that one). Both the endpoint-only and domain-bound proofs use
the same `aid-pka-v2` tag — domain binding is signalled purely by `aid-domain`
coverage, not a distinct tag. When the proof is domain-bound, discovery returns
`DiscoveryResult.DomainBound = true`. A response that covers `aid-domain`
without the client having sent `AID-Domain` is rejected (fail closed).

### v1 compatibility

Legacy `aid1` records may still use `k=z...` base58btc with `i`/`kid`. In that mode, the client sends `AID-Challenge` and `Date`, signs the legacy covered fields, and requires signature `keyid` to match DNS `kid`.

## Redirect Security

AID clients do not auto‑follow cross‑origin redirects (different hostname or port) from a discovered URI. If a 301/302/307/308 points to a different origin, treat it as a potential security risk: either fail with a security error or require explicit user confirmation.

## More on PKA

See the Identity & PKA reference for exact v2 coverage fields, algorithm, timestamps, key format, and legacy v1 compatibility behavior.
