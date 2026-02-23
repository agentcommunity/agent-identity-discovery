package org.agentcommunity.aid;

import java.net.URI;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public final class Parser {
  private Parser() {}

  public static AidRecord parse(String txtRecord) {
    Map<String, String> raw = parseRawRecord(txtRecord);
    return validateRecord(raw);
  }

  private static Map<String, String> parseRawRecord(String txtRecord) {
    Map<String, String> record = new HashMap<>();
    String[] parts = txtRecord.split(";");
    for (String part : parts) {
      String pair = part.trim();
      if (pair.isEmpty()) continue;
      int idx = pair.indexOf('=');
      if (idx < 0) {
        throw new AidError("ERR_INVALID_TXT", "Invalid key-value pair: " + pair);
      }
      String key = pair.substring(0, idx).trim().toLowerCase(Locale.ROOT);
      String value = pair.substring(idx + 1).trim();
      if (key.isEmpty() || value.isEmpty()) {
        throw new AidError("ERR_INVALID_TXT", "Empty key or value in pair: " + pair);
      }
      if (record.containsKey(key)) {
        throw new AidError("ERR_INVALID_TXT", "Duplicate key: " + key);
      }
      // Only store known keys; ignore unknown for fwd-compat
      switch (key) {
        case "version":
        case "v":
        case "uri":
        case "u":
        case "proto":
        case "p":
        case "auth":
        case "a":
        case "desc":
        case "s":
        case "docs":
        case "d":
        case "dep":
        case "e":
        case "pka":
        case "k":
        case "kid":
        case "i":
          record.put(key, value);
          break;
        default:
          // ignore unknown
      }
    }
    return record;
  }

  public static AidRecord validateRecord(Map<String, String> raw) {
    // Required fields
    boolean hasV = raw.containsKey("v");
    boolean hasVersion = raw.containsKey("version");
    if (hasV && hasVersion) {
      throw new AidError("ERR_INVALID_TXT", "Cannot specify both \"version\" and \"v\" fields");
    }
    String version = hasV ? raw.get("v") : (hasVersion ? raw.get("version") : null);
    if (version == null) {
      throw new AidError("ERR_INVALID_TXT", "Missing required field: v");
    }
    boolean hasUri = raw.containsKey("uri");
    boolean hasU = raw.containsKey("u");
    if (hasUri && hasU) {
      throw new AidError("ERR_INVALID_TXT", "Cannot specify both \"uri\" and \"u\"");
    }
    if (!hasUri && !hasU) {
      throw new AidError("ERR_INVALID_TXT", "Missing required field: uri");
    }

    boolean hasProto = raw.containsKey("proto");
    boolean hasP = raw.containsKey("p");
    if (hasProto && hasP) {
      throw new AidError("ERR_INVALID_TXT", "Cannot specify both \"proto\" and \"p\" fields");
    }
    if (!hasProto && !hasP) {
      throw new AidError("ERR_INVALID_TXT", "Missing required field: proto (or p)");
    }

    if (!Constants.SPEC_VERSION.equals(version)) {
      throw new AidError(
          "ERR_INVALID_TXT",
          "Unsupported version: " + version + ". Expected: " + Constants.SPEC_VERSION);
    }

    String protoValue = hasProto ? raw.get("proto") : raw.get("p");

    // Validate protocol token: only compare against known constants
    if (!isValidProto(protoValue)) {
      throw new AidError("ERR_UNSUPPORTED_PROTO", "Unsupported protocol: " + protoValue);
    }

    // Auth token
    if (raw.containsKey("auth") && raw.containsKey("a")) {
      throw new AidError("ERR_INVALID_TXT", "Cannot specify both \"auth\" and \"a\" fields");
    }
    String authVal = raw.containsKey("auth") ? raw.get("auth") : (raw.containsKey("a") ? raw.get("a") : null);
    if (authVal != null && !isValidAuth(authVal)) {
      throw new AidError("ERR_INVALID_TXT", "Invalid auth token: " + authVal);
    }

    // Desc length check (≤ 60 UTF-8 bytes)
    if (raw.containsKey("desc") && raw.containsKey("s")) {
      throw new AidError("ERR_INVALID_TXT", "Cannot specify both \"desc\" and \"s\" fields");
    }
    String descVal = raw.containsKey("desc") ? raw.get("desc") : (raw.containsKey("s") ? raw.get("s") : null);
    if (descVal != null) {
      int bytes = descVal.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
      if (bytes > 60) {
        throw new AidError("ERR_INVALID_TXT", "Description field must be ≤ 60 UTF-8 bytes");
      }
    }
    if (raw.containsKey("docs") && raw.containsKey("d")) {
      throw new AidError("ERR_INVALID_TXT", "Cannot specify both \"docs\" and \"d\" fields");
    }
    String docsVal = raw.containsKey("docs") ? raw.get("docs") : (raw.containsKey("d") ? raw.get("d") : null);
    if (docsVal != null) {
      if (!docsVal.startsWith("https://")) {
        throw new AidError("ERR_INVALID_TXT", "docs MUST be an absolute https:// URL");
      }
      try {
        java.net.URI du = java.net.URI.create(docsVal);
        if (!"https".equals(du.getScheme()) || du.getHost() == null) {
          throw new IllegalArgumentException();
        }
      } catch (Exception e) {
        throw new AidError("ERR_INVALID_TXT", "Invalid docs URL: " + docsVal);
      }
    }
    if (raw.containsKey("dep") && raw.containsKey("e")) {
      throw new AidError("ERR_INVALID_TXT", "Cannot specify both \"dep\" and \"e\" fields");
    }
    String depVal = raw.containsKey("dep") ? raw.get("dep") : (raw.containsKey("e") ? raw.get("e") : null);
    if (depVal != null) {
      if (!depVal.endsWith("Z")) {
        throw new AidError("ERR_INVALID_TXT", "dep MUST be an ISO 8601 UTC timestamp (e.g., 2026-01-01T00:00:00Z)");
      }
      try {
        java.time.Instant.parse(depVal);
      } catch (java.time.format.DateTimeParseException e) {
        throw new AidError("ERR_INVALID_TXT", "dep MUST be an ISO 8601 UTC timestamp (e.g., 2026-01-01T00:00:00Z)");
      }
    }

    String uri = hasUri ? raw.get("uri") : raw.get("u");
    if ("local".equals(protoValue)) {
      // must be allowed local scheme
      String scheme = extractScheme(uri);
      if (!isAllowedLocalScheme(scheme)) {
        throw new AidError(
            "ERR_INVALID_TXT",
            "Invalid URI scheme for local protocol. Must be one of: " + String.join(", ", Constants.LOCAL_URI_SCHEMES));
      }
    } else if ("zeroconf".equals(protoValue)) {
      if (!uri.startsWith("zeroconf:")) {
        throw new AidError(
            "ERR_INVALID_TXT",
            "Invalid URI scheme for 'zeroconf'. MUST be 'zeroconf:'");
      }
    } else if ("websocket".equals(protoValue)) {
      if (!uri.startsWith("wss://")) {
        throw new AidError(
            "ERR_INVALID_TXT",
            "Invalid URI scheme for 'websocket'. MUST be 'wss:'");
      }
      try {
        java.net.URI wu = java.net.URI.create(uri);
        if (!"wss".equals(wu.getScheme()) || wu.getHost() == null) {
          throw new IllegalArgumentException();
        }
      } catch (Exception e) {
        throw new AidError("ERR_INVALID_TXT", "Invalid URI format: " + uri);
      }
    } else {
      if (!uri.startsWith("https://")) {
        throw new AidError(
            "ERR_INVALID_TXT",
            "Invalid URI scheme for remote protocol '" + protoValue + "'. MUST be 'https:'");
      }
      try {
        URI u = URI.create(uri);
        if (u.getScheme() == null || u.getHost() == null) {
          throw new IllegalArgumentException();
        }
      } catch (Exception e) {
        throw new AidError("ERR_INVALID_TXT", "Invalid URI format: " + uri);
      }
    }

    String auth = authVal;
    String desc = descVal;
    if (raw.containsKey("pka") && raw.containsKey("k")) {
      throw new AidError("ERR_INVALID_TXT", "Cannot specify both \"pka\" and \"k\" fields");
    }
    if (raw.containsKey("kid") && raw.containsKey("i")) {
      throw new AidError("ERR_INVALID_TXT", "Cannot specify both \"kid\" and \"i\" fields");
    }
    String pkaVal = raw.containsKey("pka") ? raw.get("pka") : (raw.containsKey("k") ? raw.get("k") : null);
    String kidVal = raw.containsKey("kid") ? raw.get("kid") : (raw.containsKey("i") ? raw.get("i") : null);
    if (pkaVal != null && kidVal == null) {
      throw new AidError("ERR_INVALID_TXT", "kid is required when pka is present");
    }
    return new AidRecord(Constants.SPEC_VERSION, uri, protoValue, auth, desc, docsVal, depVal, pkaVal, kidVal);
  }

  public static boolean isValidProto(String token) {
    // Compare against generated PROTO_* constants
    return Constants.PROTO_MCP.equals(token)
        || Constants.PROTO_A2A.equals(token)
        || Constants.PROTO_OPENAPI.equals(token)
        || Constants.PROTO_LOCAL.equals(token)
        || Constants.PROTO_GRPC.equals(token)
        || Constants.PROTO_GRAPHQL.equals(token)
        || Constants.PROTO_UCP.equals(token)
        || Constants.PROTO_WEBSOCKET.equals(token)
        || Constants.PROTO_ZEROCONF.equals(token);
  }

  private static boolean isValidAuth(String token) {
    return "none".equals(token)
        || "pat".equals(token)
        || "apikey".equals(token)
        || "basic".equals(token)
        || "oauth2_device".equals(token)
        || "oauth2_code".equals(token)
        || "mtls".equals(token)
        || "custom".equals(token);
  }

  private static boolean isAllowedLocalScheme(String scheme) {
    if (scheme == null) return false;
    for (String s : Constants.LOCAL_URI_SCHEMES) {
      if (s.equals(scheme)) return true;
    }
    return false;
  }

  private static String extractScheme(String uri) {
    int idx = uri.indexOf(':');
    if (idx <= 0) return null;
    return uri.substring(0, idx);
  }
}
