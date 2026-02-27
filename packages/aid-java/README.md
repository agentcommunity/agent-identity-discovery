# AID Java

Minimal Java library for parsing and discovering Agent Identity & Discovery (AID) records and using generated spec constants.

## v1.1 Notes (PKA + .well-known)

This library supports `pka`/`kid` and the v1.1 PKA handshake (Ed25519 HTTP Message Signatures), plus a guarded `.well-known` fallback helper.

- `pka` is multibase base58btc (`z...`).
- Handshake enforces required covered fields, `created` ±300s, HTTP `Date` ±300s, `alg="ed25519"`, and `keyid` match.
- Requires a JDK with Ed25519 (Java 15+ typically includes it). If not available, handshake throws `ERR_SECURITY` with guidance.

### Example: .well-known fallback + handshake

```java
import org.agentcommunity.aid.WellKnown;
import org.agentcommunity.aid.AidRecord;
import java.time.Duration;

AidRecord rec = WellKnown.fetch("example.com", Duration.ofSeconds(2), false /* allowInsecure */);
System.out.println(rec.proto + " at " + rec.uri);
// If rec.pka != null, handshake was executed by WellKnown.fetch
```

### Example: Handshake only

```java
import org.agentcommunity.aid.Handshake;
import org.agentcommunity.aid.Parser;
import java.time.Duration;

var rec = Parser.parse("v=aid1;uri=https://api.example.com/mcp;p=mcp;k=zBase58Key;i=g1");
Handshake.performHandshake(rec.uri, rec.pka, rec.kid, Duration.ofSeconds(2));
```

### Example: DNS-first discovery with options

```java
import org.agentcommunity.aid.Discovery;
import org.agentcommunity.aid.Discovery.DiscoveryOptions;

var opts = new DiscoveryOptions();
opts.protocol = "mcp";               // Try protocol-specific names for the same exact host, then the exact-host base
opts.timeout = java.time.Duration.ofSeconds(5);
opts.wellKnownFallback = true;        // Only on ERR_NO_RECORD / ERR_DNS_LOOKUP_FAILED
opts.wellKnownTimeout = java.time.Duration.ofSeconds(2);

var result = Discovery.discover("example.com", opts);
System.out.println(result.record.proto + " at " + result.record.uri + ", ttl=" + result.ttl + ", name=" + result.queryName);
```

Discovery is exact-host only. Passing `app.team.example.com` does not cause implicit fallback to `_agent.team.example.com` or `_agent.example.com`. Use DNS delegation on `_agent.app.team.example.com` if you want inheritance.

## Usage

```java
import org.agentcommunity.aid.Parser;
import org.agentcommunity.aid.AidRecord;

AidRecord rec = Parser.parse("v=aid1;uri=https://api.example.com/mcp;proto=mcp;auth=pat;desc=Example");
System.out.println(rec.uri);  // https://api.example.com/mcp
```

### Errors

`Parser.parse` throws `AidError` with fields:

- `errorCode` (e.g. `ERR_INVALID_TXT`)
- `code` (numeric, e.g. `1001`)

```java
try {
  Parser.parse("v=aid1;uri=http://x;proto=mcp");
} catch (AidError e) {
  System.out.println(e.errorCode + " (" + e.code + ")");
}
```

## Development

- Generate constants from `protocol/constants.yml`:
  - `pnpm gen` (writes `packages/aid-java/src/main/java/org/agentcommunity/aid/Constants.java` if the folder exists)
- Build & test:
  - `./gradlew :aid-java:build :aid-java:test`

No external runtime dependencies; tests use JUnit 5 via Gradle.

## Redirect Security

Clients should not automatically follow cross‑origin redirects from the discovered URI. If a 301/302/307/308 points to a different hostname or port, treat as a potential security risk: fail or require explicit confirmation.

## More on PKA

See the documentation “Quick Start → PKA handshake expectations” for the exact coverage fields, algorithm, timestamp windows, and key format.
