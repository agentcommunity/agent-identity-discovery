# AidDiscovery (.NET)

Minimal .NET library for Agent Identity & Discovery (AID) parsing, discovery, and constants.

- Target framework: `net9.0`
- No external runtime dependencies
- DNS-first discovery included via DNS-over-HTTPS (DoH)

## v1.1 Notes (PKA + .well-known)

This library supports the v1.1 fields `pka`/`kid` and the PKA handshake (Ed25519 HTTP Message Signatures). It also includes a guarded `.well-known` fallback helper for environments where DNS is restricted.

- Multibase public key: `pka` uses base58btc (`z...`).
- Handshake: verifies required covered fields, `created` ±300s, HTTP `Date` ±300s, `alg="ed25519"`, `keyid` matches `kid`.
- Verification backend: recommended `NSec.Cryptography` (Ed25519). Alternatively, `Chaos.NaCl`.

### Example: .well-known fallback + handshake

```csharp
using AidDiscovery;

// Fetch from https://<domain>/.well-known/agent and validate
var record = await WellKnown.FetchAsync(
    domain: "example.com",
    timeout: TimeSpan.FromSeconds(2),
    allowInsecure: false // set true for local http testing only
);

Console.WriteLine($"{record.Proto} at {record.Uri}");
// If record.Pka != null, handshake already ran inside FetchAsync
```

### Example: DNS-first discovery with options

```csharp
using AidDiscovery;

var result = await Discovery.DiscoverAsync(
  domain: "example.com",
  new DiscoveryOptions {
    Protocol = "mcp",              // Try protocol-specific names for the same exact host, then the exact-host base
    Timeout = TimeSpan.FromSeconds(5),
    WellKnownFallback = true,       // Only on ERR_NO_RECORD / ERR_DNS_LOOKUP_FAILED
    WellKnownTimeout = TimeSpan.FromSeconds(2)
  }
);

Console.WriteLine($"{result.Record.Proto} at {result.Record.Uri}, ttl={result.Ttl}, qname={result.QueryName}");
```

Discovery is exact-host only. Passing `app.team.example.com` does not cause implicit fallback to `_agent.team.example.com` or `_agent.example.com`. Use DNS delegation on `_agent.app.team.example.com` if you want inheritance.

### Example: Handshake only

```csharp
using AidDiscovery;

// After parsing a TXT or loading from elsewhere
var rec = Aid.Parse("v=aid1;uri=https://api.example.com/mcp;p=mcp;k=zBase58Key;i=g1");
await Pka.PerformHandshakeAsync(rec.Uri, rec.Pka!, rec.Kid!, TimeSpan.FromSeconds(2));
```

## Usage

```csharp
using AidDiscovery;

var rec = Aid.Parse("v=aid1;uri=https://api.example.com/mcp;p=mcp");
Console.WriteLine($"proto={rec.Proto}, uri={rec.Uri}");
```

### Errors

`Aid.Parse` throws `AidError : Exception` on failure.

- `AidError.ErrorCode` is the symbolic code (e.g., `"ERR_INVALID_TXT"`)
- `AidError.Code` is the numeric constant (e.g., `1001`)

## Development

- Generate constants:
  - From repo root: `pnpm gen` (writes `packages/aid-dotnet/src/Constants.g.cs` when the folder exists)
- Build and test:
  - `dotnet build packages/aid-dotnet/AidDiscovery.sln`
  - `dotnet test packages/aid-dotnet/AidDiscovery.sln`

## Packaging

Placeholder for future NuGet publishing.

## Redirect Security

If the initial request to a discovered URI returns a redirect to a different origin (hostname or port), the client should not automatically follow it. Treat as a potential security risk: surface an error or require explicit confirmation.

## More on PKA

See the documentation “Quick Start → PKA handshake expectations” for the exact header coverage, algorithm, timestamps, and key format enforced by v1.1.
