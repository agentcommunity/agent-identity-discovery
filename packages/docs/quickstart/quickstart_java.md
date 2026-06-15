---
title: 'Java'
description: 'Discover and parse AID records in Java'
icon: material/language-java
---

# Java

## Discover by Domain

```java
import org.agentcommunity.aid.Discovery;
import org.agentcommunity.aid.Discovery.DiscoveryOptions;

var result = Discovery.discover("supabase.agentcommunity.org", new DiscoveryOptions());
System.out.println(result.record.proto + " at " + result.record.uri + " ttl=" + result.ttl + " qname=" + result.queryName);
```

### Options

```java
var opts = new DiscoveryOptions();
opts.protocol = "mcp";                        // Validate mcp after base lookup; proto probe is diagnostic
opts.timeout = java.time.Duration.ofSeconds(5);
opts.wellKnownFallback = true;                 // Only on ERR_NO_RECORD / ERR_DNS_LOOKUP_FAILED
opts.wellKnownTimeout = java.time.Duration.ofSeconds(2);
opts.requireDnssec = true;                     // Optional: fail if DNSSEC validation is missing

var result = Discovery.discover("example.com", opts);
```

### Parse Raw TXT

```java
import org.agentcommunity.aid.Parser;
import org.agentcommunity.aid.AidRecord;

public class Main {
  public static void main(String[] args) throws Exception {
    AidRecord rec = Parser.parse("v=aid2;u=https://api.example.com/mcp;p=mcp;s=Example");
    System.out.println(rec.uri);
  }
}
```

Notes

- PKA handshake runs automatically when v2 `pka`/`k` is present. Legacy `aid1` records still use `pka`/`kid`.
- For `aid2` PKA, the SDK sends the queried host in the `AID-Domain` header by default and surfaces `DiscoveryResult.domainBound` (`true` only for a verified domain-bound proof — one whose `aid-pka-v2` covered set includes `"aid-domain";req`). Requesting binding is not itself a mitigation — only `domain-binding=require` enforces it. See [Specification Appendix B.7](../specification.md#b7-domain-binding).
- Errors: `AidError` exposes `.errorCode` (symbol) and `.code` (number).

---

**Next:** [.NET](quickstart_dotnet.md) | [Protocols & Auth](../Reference/protocols.md) | [Troubleshooting](../Reference/troubleshooting.md)
