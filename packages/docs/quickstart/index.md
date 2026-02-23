---
title: 'Quick Start'
description: 'Publish and discover your first agent in minutes.'
icon: material/rocket-launch

extra_css_class: aid-page
---

# Quick Start Guide

Fast track for using Agent Identity & Discovery.

## Package Overview

AID provides libraries and tools for multiple languages and use cases:

| Package                                                                                                           | Purpose                                          | Language   | Status                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------- | ---------------------------------------------------------- |
| **[@agentcommunity/aid](https://www.npmjs.com/package/@agentcommunity/aid)**                                      | Core discovery library                           | TypeScript | ✅ Published                                               |
| **[@agentcommunity/aid-engine](https://www.npmjs.com/package/@agentcommunity/aid-engine)**                        | Pure business logic (discovery, validation, PKA) | TypeScript | ✅ Published                                               |
| **[@agentcommunity/aid-doctor](https://www.npmjs.com/package/@agentcommunity/aid-doctor)**                        | CLI validation & generation (wraps aid-engine)   | Node.js    | ✅ Published                                               |
| **[aid-discovery (Python)](https://pypi.org/project/aid-discovery/)**                                             | Python discovery library                         | Python     | 🔜 Published (not yet community-owned; transfer planned)   |
| **[aid-go](https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-go)**                | Go discovery library                             | Go         | ✅ Published                                               |
| **AID Web Workbench**                                                                                             | Interactive generator & resolver                 | Web        | 🌐 [Try it live](https://aid.agentcommunity.org/workbench) |
| **[aid-rs (Rust)](https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-rs)**         | Parser + discovery (opt. PKA)                    | Rust       | ✅ In repo                                                 |
| **[aid-dotnet (.NET)](https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-dotnet)** | Parser + discovery + PKA + WK                    | .NET       | ✅ In repo                                                 |
| **[aid-java (Java)](https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-java)**     | Parser + discovery + PKA + WK                    | Java       | ✅ In repo                                                 |

---

Note: Constants across languages are generated from a single contract file via `pnpm gen` (source: `protocol/constants.yml`).

## Part 1: For Providers (Publishing Your Agent)

Do you have an agent with an API endpoint? Let's make it discoverable. All you need is access to your domain's DNS settings.

### Option A: Quick CLI Generation (Recommended)

The fastest way to get started is with our CLI tool:

```bash
# Install the CLI globally
npm install -g @agentcommunity/aid-doctor

# Generate a TXT record interactively
aid-doctor generate

# Or generate directly with flags
aid-doctor generate \
  --uri https://api.my-cool-saas.com/agent/v1 \
  --proto mcp \
  --desc "My Cool SaaS AI"
```

This outputs the exact TXT record content you need:

```
v=aid1;uri=https://api.my-cool-saas.com/agent/v1;p=mcp;desc=My Cool SaaS AI
```

**Plus validation:** The CLI automatically validates your record format, URI scheme, and protocol tokens before generating.

### Option B: Manual Generation

If you prefer to craft the record manually:

#### Step 1: Gather Your Agent's Info

You need two things:

1.  **URI:** The full URL to your agent's endpoint.
    - _Example:_ `https://api.my-cool-saas.com/agent/v1`
2.  **Protocol:** The protocol it speaks. Let's assume `mcp`.
    - _Example:_ `mcp`

#### Step 2: Generate the TXT Record Content

The AID record is a single string of `key=value` pairs.

```
v=aid1;uri=https://api.my-cool-saas.com/agent/v1;p=mcp;desc=My Cool SaaS AI
```

> **Tip:** Use our [**Live Generator**](https://aid.agentcommunity.org/workbench) to create this string and avoid typos!

### Step 3: Add the Record to Your DNS

Go to your DNS provider (Cloudflare, Vercel, GoDaddy, etc.) and add a new `TXT` record.

- **Type:** `TXT`
- **Name (or Host):** `_agent` (for the domain `my-cool-saas.com`)
- **Content (or Value):** The string from Step 2.
- **TTL:** `300` (5 minutes) is a good starting point.

### Step 4: Verify Your Record

Wait a few minutes for DNS to propagate. You can then check your work:

**Using the CLI:**

```bash
aid-doctor check my-cool-saas.com
```

> **Note:** The `aid-doctor` CLI uses the `@agentcommunity/aid-engine` library under the hood for all discovery and validation logic.

**Using command line tools:**

```bash
# For Mac/Linux
dig TXT _agent.my-cool-saas.com

# For Windows
nslookup -q=TXT _agent.my-cool-saas.com
```

**The output should show your record!**

---

## Part 2: For Clients (Discovering an Agent)

Now let's write code to find an agent. We provide libraries in several languages to make this trivial.

### Language Guides

- [TypeScript / Node.js](./quickstart_ts.md)
- [Browser](./quickstart_browser.md)
- [Go](./quickstart_go.md)
- [Python](./quickstart_python.md)
- [Rust](./quickstart_rust.md)
- [Java](./quickstart_java.md)
- [.NET](./quickstart_dotnet.md)

### TypeScript / JavaScript

Install the library:

```bash
pnpm add @agentcommunity/aid
```

Then use the `discover` function:

```typescript
import { discover } from '@agentcommunity/aid';

try {
  // Use a real, AID-enabled domain
  const { record, ttl } = await discover('supabase.agentcommunity.org');

  console.log('Discovery successful!');
  console.log(`  -> Protocol: ${record.proto}`); // "mcp"
  console.log(`  -> URI: ${record.uri}`); // "https://api.supabase.com/mcp"
  console.log(`  -> Description: ${record.desc}`); // "Supabase MCP"
} catch (error) {
  console.error(`Discovery failed: ${error.message}`);
}
```

**Browser Support:** For browser environments, use the DNS-over-HTTPS version:

```typescript
import { discover } from '@agentcommunity/aid/browser';

const { record } = await discover('supabase.agentcommunity.org');
console.log(`Found ${record.proto} agent at ${record.uri}`);
```

#### PKA handshake expectations (v1.2)

Clients perform an Ed25519 HTTP Message Signatures handshake when a record includes `pka`/`kid`. Implementations enforce:

- Covered fields set: `"AID-Challenge" "@method" "@target-uri" "host" "date"`
- `alg="ed25519"`
- `keyid` equals record `kid` (quotes allowed in header; compare normalized)
- `created` ± 300s and HTTP `Date` ± 300s of current time
- `pka` is base58btc (`z...`) for a 32‑byte Ed25519 public key

### Python

Install the library:

```bash
pip install aid-discovery
```

Then use the `discover` function:

```python
from aid_py import discover, AidError

try:
    # Use a real, AID-enabled domain
    result = discover("supabase.agentcommunity.org")

    print("Discovery successful!")
    print(f"  -> Protocol: {result.record.proto}") # "mcp"
    print(f"  -> URI: {result.record.uri}") # "https://api.supabase.com/mcp"
    print(f"  -> Description: {result.record.desc}") # "Supabase MCP"

except AidError as e:
    print(f"Discovery failed: {e}")

# NOTE: The Python package is currently published at https://pypi.org/project/aid-discovery/ and is not yet community-owned. Community transfer is planned for a future release.
```

> **📖 More Details:** See the [Python package on PyPI](https://pypi.org/project/aid-discovery/) for advanced usage, error handling, and API reference.

### Go

Install the library:

```bash
go get -u github.com/agentcommunity/agent-identity-discovery/aid-go
```

Then use the `Discover` function:

```go
package main

import (
    "fmt"
    "log"
    "time"

    "github.com/agentcommunity/agent-identity-discovery/aid-go"
)

func main() {
    // Use a real, AID-enabled domain
    result, ttl, err := aid.Discover("supabase.agentcommunity.org", 5*time.Second)
    if err != nil {
        log.Fatalf("Discovery failed: %v", err)
    }

    fmt.Println("Discovery successful!")
    fmt.Printf("  -> Protocol: %s\n", result.Proto) // "mcp"
    fmt.Printf("  -> URI: %s\n", result.URI) // "https://api.supabase.com/mcp"
    fmt.Printf("  -> Description: %s\n", result.Desc) // "Supabase MCP"
    fmt.Printf("  -> TTL: %d seconds\n", ttl)
}
```

> **📖 More Details:** See the [Go package README](https://github.com/agentcommunity/agent-identity-discovery/tree/main/packages/aid-go) for advanced usage, error handling, and API reference.

## Doctor CLI in CI

Use the doctor CLI to validate domains in CI and capture structured errors. For local loopback tests against a mock HTTP server, allow insecure well‑known via an environment flag, but only in development.

```bash
# Human-readable
aid-doctor check example.com --show-details

# JSON for CI
aid-doctor json example.com > result.json

# Exit code scripting (check)
aid-doctor check example.com --code || echo "failed with code $?"

# Dev-only loopback test against a mock on 127.0.0.1:19081
AID_ALLOW_INSECURE_WELL_KNOWN=1 aid-doctor check 127.0.0.1:19081 --show-details --fallback-timeout 5000
```

> **Note:** The `aid-doctor` CLI uses the `@agentcommunity/aid-engine` library under the hood for all discovery and validation logic.

In production, `.well-known` must use HTTPS; the loopback relax is for local development only.

**That's it!** You now have the agent's URI and can proceed to connect to it using its specified protocol.

---

**Explore:** [Protocols & Auth](../Reference/protocols.md) | [Security](../Reference/security.md) | [Specification](../specification.md) | [Rationale](../Understand/rationale.md)
