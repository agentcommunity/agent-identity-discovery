# AID Java

Minimal Java library for parsing and discovering Agent Identity & Discovery (AID) records and using generated spec constants.

## v2 PKA Default

This library supports `aid2` records and the v2 PKA handshake (Ed25519 HTTP Message Signatures), plus a guarded `.well-known` fallback helper.

- v2 `pka`/`k` is the unpadded base64url Ed25519 JWK `x` value.
- v2 HTTP signature `keyid` is the RFC 7638 JWK thumbprint derived from `k`; DNS `kid`/`i` is not used in `aid2`.
- v2 handshake uses RFC 9421 `Accept-Signature` with a nonce, required `created` and `expires`, exact nonce echo, and response `Cache-Control: no-store`.
- Requires a JDK with Ed25519 (Java 15+ typically includes it). If not available, handshake throws `ERR_SECURITY` with guidance.

### Example: .well-known fallback + handshake

```java
import org.agentcommunity.aid.WellKnown;
import java.time.Duration;

WellKnown.Result result =
    WellKnown.fetchBound("example.com", Duration.ofSeconds(2), false /* allowInsecure */, "example.com");
System.out.println(result.record.proto + " at " + result.record.uri + " domainBound=" + result.domainBound);
// If result.record.pka != null, handshake was executed by WellKnown.fetchBound
```

### Example: Handshake only

```java
import org.agentcommunity.aid.Handshake;
import org.agentcommunity.aid.Parser;
import java.time.Duration;

var rec = Parser.parse("v=aid2;uri=https://api.example.com/mcp;p=mcp;k=ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ");
boolean domainBound =
    Handshake.performHandshake(rec.uri, rec.pka, null, Duration.ofSeconds(2), "example.com");
```

### Example: DNS-first discovery with options

```java
import org.agentcommunity.aid.Discovery;
import org.agentcommunity.aid.Discovery.DiscoveryOptions;

var opts = new DiscoveryOptions();
opts.protocol = "mcp";               // Query exact-host base first; protocol-specific probing is diagnostic/base-failure-only where configured
opts.timeout = java.time.Duration.ofSeconds(5);
opts.wellKnownFallback = true;        // Only on ERR_NO_RECORD / ERR_DNS_LOOKUP_FAILED
opts.wellKnownTimeout = java.time.Duration.ofSeconds(2);

var result = Discovery.discover("example.com", opts);
System.out.println(result.record.proto + " at " + result.record.uri + ", ttl=" + result.ttl + ", name=" + result.queryName + ", domainBound=" + result.domainBound);
```

Discovery is exact-host only. Passing `app.team.example.com` does not cause implicit fallback to `_agent.team.example.com` or `_agent.example.com`. Use DNS delegation on `_agent.app.team.example.com` if you want inheritance.

## Usage

```java
import org.agentcommunity.aid.Parser;
import org.agentcommunity.aid.AidRecord;

AidRecord rec = Parser.parse("v=aid2;uri=https://api.example.com/mcp;proto=mcp;auth=pat;desc=Example");
System.out.println(rec.uri);  // https://api.example.com/mcp
```

### Errors

`Parser.parse` throws `AidError` with fields:

- `errorCode` (e.g. `ERR_INVALID_TXT`)
- `code` (numeric, e.g. `1001`)

```java
try {
  Parser.parse("v=aid2;uri=http://x;proto=mcp");
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

See the Identity & PKA reference for exact v2 coverage fields, algorithm, timestamp windows, key format, and legacy v1 compatibility behavior.

## v1 compatibility

Legacy `aid1` records may still use `k=z...` base58btc plus `i`/`kid`. In that mode, clients send `AID-Challenge` and signed HTTP `Date`, and signature `keyid` must match DNS `kid`.
