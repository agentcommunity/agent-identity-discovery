---
title: '.NET'
description: 'Discover and parse AID records in .NET'
icon: material/language-csharp
---

# .NET

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

var rec = Aid.Parse("v=aid1;u=https://api.example.com/mcp;p=mcp;s=Example");
Console.WriteLine($"proto={rec.Proto}, uri={rec.Uri}");
```

Notes

- PKA handshake runs automatically when `pka`/`kid` are present.
- Errors: `AidError : Exception` exposes `.ErrorCode` (symbol) and `.Code` (number).

---

**Next:** [Java](quickstart_java.md) | [Protocols & Auth](../Reference/protocols.md) | [Troubleshooting](../Reference/troubleshooting.md)
