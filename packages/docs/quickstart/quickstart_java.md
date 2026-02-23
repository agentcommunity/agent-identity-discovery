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
opts.protocol = "mcp";                        // Try _agent._mcp., then _agent.mcp., then base
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
    AidRecord rec = Parser.parse("v=aid1;uri=https://api.example.com/mcp;proto=mcp;desc=Example");
    System.out.println(rec.uri);
  }
}
```

Notes

- PKA handshake runs automatically when `pka`/`kid` are present.
- Errors: `AidError` exposes `.errorCode` (symbol) and `.code` (number).

---

**Next:** [.NET](quickstart_dotnet.md) | [Protocols & Auth](../Reference/protocols.md) | [Troubleshooting](../Reference/troubleshooting.md)
