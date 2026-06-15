---
title: '.NET'
description: 'Discover and parse AID records in .NET'
icon: material/language-csharp
---

# .NET

> **Not yet published to NuGet.** Consume the SDK from source (see `packages/aid-dotnet/`) until a NuGet package is available. The `dotnet add package` command will be added here once the package is published.

## Discover by Domain

```csharp
using AidDiscovery;

var result = await Discovery.DiscoverAsync(
  domain: "supabase.agentcommunity.org",
  new DiscoveryOptions {
    Timeout = TimeSpan.FromSeconds(5),
    WellKnownFallback = true,
    WellKnownTimeout = TimeSpan.FromSeconds(2)
  }
);

Console.WriteLine($"{result.Record.Proto} at {result.Record.Uri} ttl={result.Ttl} qname={result.QueryName}");
```

### Options

```csharp
// Protocol-specific DNS flow
await Discovery.DiscoverAsync("example.com", new DiscoveryOptions { Protocol = "mcp" });

// Guarded .well-known fallback (on ERR_NO_RECORD / ERR_DNS_LOOKUP_FAILED)
await Discovery.DiscoverAsync("example.com", new DiscoveryOptions { WellKnownFallback = true });

// Independent timeout for well-known (default ~2s)
await Discovery.DiscoverAsync("example.com", new DiscoveryOptions { WellKnownTimeout = TimeSpan.FromSeconds(3) });
```

### Parse Raw TXT

```csharp
using AidDiscovery;

var rec = Aid.Parse("v=aid2;u=https://api.example.com/mcp;p=mcp;s=Example");
Console.WriteLine($"proto={rec.Proto}, uri={rec.Uri}");
```

Notes

- PKA handshake runs automatically when v2 `pka`/`k` is present. Legacy `aid1` records still use `pka`/`kid`.
- For `aid2` PKA, the SDK sends the queried host in the `AID-Domain` header by default and surfaces `DiscoveryResult.DomainBound` (`true` only for a verified domain-bound proof — one whose `aid-pka-v2` covered set includes `"aid-domain";req`). Requesting binding is not itself a mitigation — only `domain-binding=require` enforces it. See [Specification Appendix B.7](../specification.md#b7-domain-binding).
- Errors: `AidError : Exception` exposes `.ErrorCode` (symbol) and `.Code` (number).

---

**Next:** [Java](quickstart_java.md) | [Protocols & Auth](../Reference/protocols.md) | [Troubleshooting](../Reference/troubleshooting.md)
