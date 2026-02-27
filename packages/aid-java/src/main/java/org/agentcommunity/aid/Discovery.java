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
import java.util.Map;
import java.util.Optional;

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

  private static class ParsedRecordWithTtl {
    final AidRecord record;
    final int ttl;
    ParsedRecordWithTtl(AidRecord record, int ttl) { this.record = record; this.ttl = ttl; }
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
      if (doh.status != 0) throw new AidError("ERR_DNS_LOOKUP_FAILED", "DoH status: " + doh.status);
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

  private static ParsedRecordWithTtl parseSingleValid(List<DoHAnswer> answers, Duration timeout, String queryName) {
    AidError last = null;
    ParsedRecordWithTtl valid = null;
    int validCount = 0;
    for (DoHAnswer answer : answers) {
      try {
        AidRecord rec = Parser.parse(answer.data);
        valid = new ParsedRecordWithTtl(rec, answer.ttl);
        validCount += 1;
      } catch (AidError e) { last = e; }
    }
    if (validCount == 1 && valid != null) {
      if (valid.record.pka != null) Handshake.performHandshake(valid.record.uri, valid.record.pka, valid.record.kid == null ? "" : valid.record.kid, timeout);
      return valid;
    }
    if (validCount > 1) {
      throw new AidError(
          "ERR_INVALID_TXT",
          "Multiple valid AID records found for " + queryName + "; publish exactly one valid record per queried DNS name");
    }
    throw last != null ? last : new AidError("ERR_NO_RECORD", "No valid AID record in TXT answers");
  }

  public static DiscoveryResult discover(String domain, DiscoveryOptions options) {
    if (options == null) options = new DiscoveryOptions();
    String alabel = toALabel(domain);
    List<String> names = new ArrayList<>();
    if (options.protocol != null && !options.protocol.isEmpty()) {
      names.add(Constants.DNS_SUBDOMAIN + "._" + options.protocol + "." + alabel);
      names.add(Constants.DNS_SUBDOMAIN + "." + options.protocol + "." + alabel);
    }
    names.add(Constants.DNS_SUBDOMAIN + "." + alabel);

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

    if (options.wellKnownFallback && last != null && ("ERR_NO_RECORD".equals(last.errorCode) || "ERR_DNS_LOOKUP_FAILED".equals(last.errorCode))) {
      AidRecord rec = WellKnown.fetch(alabel, options.wellKnownTimeout, false);
      return new DiscoveryResult(rec, Constants.DNS_TTL_MIN, Constants.DNS_SUBDOMAIN+"."+alabel);
    }
    throw last != null ? last : new AidError("ERR_DNS_LOOKUP_FAILED", "DNS query failed");
  }
}
