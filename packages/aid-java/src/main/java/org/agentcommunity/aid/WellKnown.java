package org.agentcommunity.aid;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class WellKnown {
  private WellKnown() {}

  private static Map<String, String> parseSimpleJsonObject(String json) throws java.io.IOException {
    ObjectMapper mapper = new ObjectMapper();
    TypeReference<HashMap<String, String>> typeRef = new TypeReference<>() {};
    return mapper.readValue(json, typeRef);
  }

  private static String canonicalizeToTxt(Map<String, String> obj) {
    String v = obj.get("v");
    String uri = obj.containsKey("uri") ? obj.get("uri") : obj.get("u");
    String proto = obj.containsKey("proto") ? obj.get("proto") : obj.get("p");
    String auth = obj.containsKey("auth") ? obj.get("auth") : obj.get("a");
    String desc = obj.containsKey("desc") ? obj.get("desc") : obj.get("s");
    String docs = obj.containsKey("docs") ? obj.get("docs") : obj.get("d");
    String dep = obj.containsKey("dep") ? obj.get("dep") : obj.get("e");
    String pka = obj.containsKey("pka") ? obj.get("pka") : obj.get("k");
    String kid = obj.containsKey("kid") ? obj.get("kid") : obj.get("i");
    StringBuilder sb = new StringBuilder();
    if (v != null) sb.append("v=").append(v).append(';');
    if (uri != null) sb.append("uri=").append(uri).append(';');
    if (proto != null) sb.append("proto=").append(proto).append(';');
    if (auth != null && !auth.isEmpty()) sb.append("auth=").append(auth).append(';');
    if (desc != null && !desc.isEmpty()) sb.append("desc=").append(desc).append(';');
    if (docs != null && !docs.isEmpty()) sb.append("docs=").append(docs).append(';');
    if (dep != null && !dep.isEmpty()) sb.append("dep=").append(dep).append(';');
    if (pka != null && !pka.isEmpty()) sb.append("pka=").append(pka).append(';');
    if (kid != null && !kid.isEmpty()) sb.append("kid=").append(kid).append(';');
    if (sb.length() > 0 && sb.charAt(sb.length() - 1) == ';') sb.setLength(sb.length() - 1);
    return sb.toString();
  }

  /** Result of a .well-known fetch: the parsed record and whether a domain-bound PKA proof was obtained. */
  public static final class Result {
    public final AidRecord record;
    public final boolean domainBound;
    public Result(AidRecord record, boolean domainBound) {
      this.record = record;
      this.domainBound = domainBound;
    }
  }

  public static AidRecord fetch(String domain, Duration timeout, boolean allowInsecure) {
    return fetchBound(domain, timeout, allowInsecure, domain).record;
  }

  public static Result fetchBound(String domain, Duration timeout, boolean allowInsecure, String queriedDomain) {
    String scheme = allowInsecure ? "http" : "https";
    String url = scheme + "://" + domain + "/.well-known/agent";
    HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).connectTimeout(timeout).build();
    HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(timeout).GET().build();
    HttpResponse<String> res;
    try {
      res = http.send(req, HttpResponse.BodyHandlers.ofString());
    } catch (Exception e) {
      throw new AidError("ERR_FALLBACK_FAILED", e.getMessage());
    }
    if (res.statusCode() / 100 != 2) throw new AidError("ERR_FALLBACK_FAILED", "Well-known HTTP " + res.statusCode());
    String ct = res.headers().firstValue("content-type").orElse("").toLowerCase(Locale.ROOT);
    if (!ct.startsWith("application/json")) throw new AidError("ERR_FALLBACK_FAILED", "Invalid content-type for well-known (expected application/json)");
    String text = res.body();
    if (text.length() > 64 * 1024) throw new AidError("ERR_FALLBACK_FAILED", "Well-known response too large (>64KB)");
    Map<String, String> map;
    try {
      map = parseSimpleJsonObject(text);
    } catch (Exception e) {
      throw new AidError("ERR_FALLBACK_FAILED", "Failed to parse Well-known JSON: " + e.getMessage());
    }
    if (map.isEmpty()) throw new AidError("ERR_FALLBACK_FAILED", "Well-known JSON must be an object");
    String txt = canonicalizeToTxt(map);
    AidRecord rec;
    try {
      rec = Parser.parse(txt);
    } catch (AidError err) {
      // Narrow relaxation: allow loopback HTTP only when explicitly enabled via allowInsecure
      String host = domain;
      boolean isLoopback = host.equalsIgnoreCase("localhost") || host.startsWith("127.0.0.1") || host.equals("::1");
      String uri = map.containsKey("uri") ? map.get("uri") : map.get("u");
      String proto = map.containsKey("proto") ? map.get("proto") : map.get("p");
      boolean isHttpRemote = uri != null && uri.startsWith("http://");
      boolean isRemoteProto = proto != null && !(proto.equals("local") || proto.equals("zeroconf") || proto.equals("websocket"));
      if (!(allowInsecure && isLoopback && isHttpRemote && isRemoteProto)) throw err;
      // Validate other fields by upgrading scheme just for validation
      String txtHttps = txt.replaceFirst("uri=http://", "uri=https://").replaceFirst("u=http://", "u=https://");
      AidRecord validated = Parser.parse(txtHttps);
      // Restore http URI in the resulting record
      rec = new AidRecord(validated.v, uri, validated.proto, validated.auth, validated.desc, validated.docs, validated.dep, validated.pka, validated.kid);
    }
    boolean domainBound = false;
    if (rec.pka != null) {
      domainBound = Handshake.performHandshake(
          rec.uri,
          rec.pka,
          rec.kid == null ? "" : rec.kid,
          timeout,
          queriedDomain == null ? domain : queriedDomain);
    }
    return new Result(rec, domainBound);
  }
}
