package org.agentcommunity.aid;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.IDN;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class Discovery {
  private Discovery() {}

  public static final class DiscoveryOptions {
    public String protocol;
    public Duration timeout = Duration.ofSeconds(5);
    public boolean wellKnownFallback = true;
    public Duration wellKnownTimeout = Duration.ofSeconds(2);
    public boolean requireDnssec = false;
  }

  public static final class DiscoveryResult {
    public final AidRecord record;
    public final int ttl;
    public final String queryName;
    public DiscoveryResult(AidRecord record, int ttl, String queryName) {
      this.record = record; this.ttl = ttl; this.queryName = queryName;
    }
  }

  private static String toALabel(String domain) {
    try { return IDN.toASCII(domain); } catch (Exception e) { return domain; }
  }

  // --- DoH Response DTOs for Jackson ---
  @JsonIgnoreProperties(ignoreUnknown = true)
  private static class DoHResponse {
    @JsonProperty("Status")
    public int status;
    @JsonProperty("AD")
    public boolean ad; // Authenticated Data (DNSSEC)
    @JsonProperty("Answer")
    public List<DoHAnswer> answer;
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private static class DoHAnswer {
    @JsonProperty("data")
    public String data;
    @JsonProperty("TTL")
    public int ttl;
  }

  static final class RawTxtAnswer {
    final String data;
    final int ttl;
    RawTxtAnswer(String data, int ttl) {
      this.data = data;
      this.ttl = ttl;
    }
  }

  static final class ParsedRecordWithTtl {
    final AidRecord record;
    final int ttl;
    ParsedRecordWithTtl(AidRecord record, int ttl) { this.record = record; this.ttl = ttl; }
  }

  @FunctionalInterface
  interface WellKnownFetcher {
    AidRecord fetch(String domain, Duration timeout);
  }

  static List<String> queryNames(String alabel, String protocol) {
    List<String> names = new ArrayList<>();
    if (protocol != null && !protocol.isEmpty()) {
      names.add(Constants.DNS_SUBDOMAIN + "._" + protocol + "." + alabel);
    }
    names.add(Constants.DNS_SUBDOMAIN + "." + alabel);
    return names;
  }

  static boolean isNoRecordDohStatus(int status) {
    return status == 3;
  }

  private static DoHResponse queryTxtDoH(String fqdn, Duration timeout) {
    String url = "https://cloudflare-dns.com/dns-query?name=" + URI.create("http://x/"+fqdn).getRawPath().substring(3) + "&type=TXT";
    HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).connectTimeout(timeout).build();
    HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(timeout).header("Accept", "application/dns-json").GET().build();
    try {
      HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
      if (res.statusCode() / 100 != 2) throw new AidError("ERR_DNS_LOOKUP_FAILED", "DoH HTTP "+res.statusCode());
      ObjectMapper mapper = new ObjectMapper();
      DoHResponse doh = mapper.readValue(res.body(), DoHResponse.class);
      if (doh.status != 0) {
        if (isNoRecordDohStatus(doh.status)) throw new AidError("ERR_NO_RECORD", "No TXT answers for " + fqdn);
        throw new AidError("ERR_DNS_LOOKUP_FAILED", "DoH status: " + doh.status);
      }
      if (doh.answer == null || doh.answer.isEmpty()) throw new AidError("ERR_NO_RECORD", "No TXT answers for "+fqdn);
      // Clean up quoted string data from DoH response
      for (DoHAnswer ans : doh.answer) {
        if (ans.data != null && ans.data.length() >= 2 && ans.data.startsWith("\"") && ans.data.endsWith("\""))
          ans.data = ans.data.substring(1, ans.data.length()-1);
      }
      return doh;
    } catch (AidError e) { throw e; }
    catch (Exception e) { throw new AidError("ERR_DNS_LOOKUP_FAILED", e.getMessage()); }
  }

  static ParsedRecordWithTtl selectValidRecord(List<RawTxtAnswer> answers, Duration timeout, String queryName, boolean performHandshake) {
    AidError last = null;
    List<ParsedRecordWithTtl> validRecords = new ArrayList<>();
    for (RawTxtAnswer answer : answers) {
      if (!looksLikeAidRecord(answer.data)) continue;
      try {
        AidRecord rec = Parser.parse(answer.data);
        validRecords.add(new ParsedRecordWithTtl(rec, answer.ttl));
      } catch (AidError e) { last = e; }
    }

    if (!validRecords.isEmpty()) {
      String selectedVersion = Constants.SPEC_VERSION_V1;
      for (ParsedRecordWithTtl result : validRecords) {
        if (Constants.SPEC_VERSION_V2.equals(result.record.v)) {
          selectedVersion = Constants.SPEC_VERSION_V2;
          break;
        }
      }
      List<ParsedRecordWithTtl> selectedRecords = new ArrayList<>();
      for (ParsedRecordWithTtl result : validRecords) {
        if (selectedVersion.equals(result.record.v)) {
          selectedRecords.add(result);
        }
      }
      if (selectedRecords.size() > 1) {
        throw new AidError(
            "ERR_INVALID_TXT",
            "Multiple valid " + selectedVersion + " AID records found for " + queryName + "; publish exactly one valid record per queried DNS name");
      }
      ParsedRecordWithTtl selected = selectedRecords.get(0);
      if (performHandshake && selected.record.pka != null) {
        Handshake.performHandshake(selected.record.uri, selected.record.pka, selected.record.kid == null ? "" : selected.record.kid, timeout);
      }
      return selected;
    }

    throw last != null ? last : new AidError("ERR_NO_RECORD", "No valid AID record in TXT answers");
  }

  private static boolean looksLikeAidRecord(String raw) {
    if (raw == null) return false;
    String[] parts = raw.split(";");
    for (String part : parts) {
      String pair = part.trim();
      int idx = pair.indexOf('=');
      if (idx < 0) continue;
      String key = pair.substring(0, idx).trim().toLowerCase(Locale.ROOT);
      if (!"v".equals(key) && !"version".equals(key)) continue;
      String value = pair.substring(idx + 1).trim();
      return value.toLowerCase(Locale.ROOT).matches("aid[0-9]+");
    }
    return false;
  }

  private static ParsedRecordWithTtl parseSingleValid(List<DoHAnswer> answers, Duration timeout, String queryName) {
    List<RawTxtAnswer> rawAnswers = new ArrayList<>();
    for (DoHAnswer answer : answers) {
      rawAnswers.add(new RawTxtAnswer(answer.data, answer.ttl));
    }
    return selectValidRecord(rawAnswers, timeout, queryName, true);
  }

  public static DiscoveryResult discover(String domain, DiscoveryOptions options) {
    if (options == null) options = new DiscoveryOptions();
    String alabel = toALabel(domain);
    List<String> names = queryNames(alabel, options.protocol);

    AidError last = null;
    for (String name : names) {
      try {
        DoHResponse res = queryTxtDoH(name, options.timeout);
        if (options.requireDnssec && !res.ad) {
          throw new AidError("ERR_SECURITY", "DNSSEC validation failed or was not available for " + name);
        }
        ParsedRecordWithTtl p = parseSingleValid(res.answer, options.timeout, name);
        return new DiscoveryResult(p.record, p.ttl, name);
      } catch (AidError e) {
        last = e;
        if (!"ERR_NO_RECORD".equals(e.errorCode)) break;
      }
    }

    return resolveWellKnownFallback(alabel, options, last, (fallbackDomain, timeout) -> WellKnown.fetch(fallbackDomain, timeout, false));
  }

  static DiscoveryResult resolveWellKnownFallback(
      String alabel, DiscoveryOptions options, AidError last, WellKnownFetcher fetcher) {
    if (last != null && isWellKnownFallbackEligible(last)) {
      if (options.requireDnssec) {
        throw new AidError(
            "ERR_SECURITY",
            "DNSSEC is required; .well-known fallback cannot satisfy dnssec=require for " + alabel);
      }
      if (options.wellKnownFallback) {
        AidRecord rec = fetcher.fetch(alabel, options.wellKnownTimeout);
        return new DiscoveryResult(rec, Constants.DNS_TTL_MIN, Constants.DNS_SUBDOMAIN+"."+alabel);
      }
    }
    throw last != null ? last : new AidError("ERR_DNS_LOOKUP_FAILED", "DNS query failed");
  }

  private static boolean isWellKnownFallbackEligible(AidError error) {
    return "ERR_NO_RECORD".equals(error.errorCode) || "ERR_DNS_LOOKUP_FAILED".equals(error.errorCode);
  }
}
