package org.agentcommunity.aid;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.Duration;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.security.SecureRandom;

public final class Handshake {
  private Handshake() {}

  private static final SecureRandom SECURE_RANDOM = new SecureRandom();

  static final String AID_PKA_TAG_V2 = "aid-pka-v2";

  private static String asciiToLower(String s) {
    char[] chars = s.toCharArray();
    for (int i = 0; i < chars.length; i++) {
        char c = chars[i];
        if (c >= 'A' && c <= 'Z') {
            chars[i] = (char) (c + ('a' - 'A'));
        }
    }
    return new String(chars);
  }

  private static byte[] multibaseDecode(String s) {
    if (s == null || s.isEmpty()) throw new AidError("ERR_SECURITY", "Empty PKA");
    if (s.charAt(0) != 'z') throw new AidError("ERR_SECURITY", "Unsupported multibase prefix");
    return Base58.decode(s.substring(1));
  }

  private static class SigData {
    String[] covered;
    long created;
    String keyidRaw;
    String keyid;
    String alg;
    byte[] signature;
    String responseDate;
  }

  private static class V2CoveredItem {
    final String raw;
    final String name;
    final boolean req;

    V2CoveredItem(String raw, String name, boolean req) {
      this.raw = raw;
      this.name = name;
      this.req = req;
    }
  }

  private static class V2SigData {
    List<V2CoveredItem> covered;
    String signatureParamsRaw;
    long created;
    long expires;
    String keyid;
    String alg;
    String nonce;
    String tag;
    boolean domainBound;
    byte[] signature;
  }

  private static SigData parseSignatureHeaders(HttpResponse<byte[]> res) {
    String sigInput = getHeader(res, "Signature-Input");
    String sig = getHeader(res, "Signature");
    if (sigInput == null || sig == null) throw new AidError("ERR_SECURITY", "Missing signature headers");
    Matcher inside = Pattern.compile("sig=\\(\\s*([^)]*?)\\s*\\)", Pattern.CASE_INSENSITIVE).matcher(sigInput);
    if (!inside.find()) throw new AidError("ERR_SECURITY", "Invalid Signature-Input");
    List<String> items = new ArrayList<>();
    Matcher m = Pattern.compile("\"([^\"]+)\"").matcher(inside.group(1));
    while (m.find()) items.add(m.group(1));
    if (items.isEmpty()) throw new AidError("ERR_SECURITY", "Invalid Signature-Input");

    String[] required = new String[]{"aid-challenge", "@method", "@target-uri", "host", "date"};
    if (items.size() != required.length) {
      throw new AidError("ERR_SECURITY", "Signature-Input must cover required fields");
    }

    List<String> lower = new ArrayList<>();
    for (String it : items) lower.add(asciiToLower(it));
    Collections.sort(lower);
    Arrays.sort(required);

    boolean areEqual = true;
    for (int i = 0; i < required.length; i++) {
        if (!MessageDigest.isEqual(
                lower.get(i).getBytes(StandardCharsets.UTF_8),
                required[i].getBytes(StandardCharsets.UTF_8))) {
            areEqual = false;
            // Deliberately not breaking early
        }
    }
    if (!areEqual) {
        throw new AidError("ERR_SECURITY", "Signature-Input must cover required fields");
    }

    Matcher mc = Pattern.compile("(?:^|;)\\s*created=(\\d+)", Pattern.CASE_INSENSITIVE).matcher(sigInput);
    Matcher mk = Pattern.compile("(?:^|;)\\s*keyid=([^;\\s]+)", Pattern.CASE_INSENSITIVE).matcher(sigInput);
    Matcher ma = Pattern.compile("(?:^|;)\\s*alg=\"([^\"]+)\"", Pattern.CASE_INSENSITIVE).matcher(sigInput);
    if (!mc.find() || !mk.find() || !ma.find()) throw new AidError("ERR_SECURITY", "Invalid Signature-Input");
    long created;
    try {
      created = Long.parseLong(mc.group(1));
    } catch (NumberFormatException e) {
      throw new AidError("ERR_SECURITY", "Invalid created timestamp");
    }
    String keyidRaw = mk.group(1);
    String keyid = keyidRaw.replaceAll("^\"(.+)\"$", "$1");
    String alg = asciiToLower(ma.group(1));

    Matcher ms = Pattern.compile("sig\\s*=\\s*:\\s*([^:]+)\\s*:", Pattern.CASE_INSENSITIVE).matcher(sig);
    if (!ms.find()) throw new AidError("ERR_SECURITY", "Invalid Signature header");
    byte[] signature = Base64.getDecoder().decode(ms.group(1));
    String responseDate = getHeader(res, "Date");

    SigData d = new SigData();
    d.covered = items.toArray(new String[0]);
    d.created = created;
    d.keyidRaw = keyidRaw;
    d.keyid = keyid;
    d.alg = alg;
    d.signature = signature;
    d.responseDate = responseDate;
    return d;
  }

  private static String getHeader(HttpResponse<byte[]> res, String name) {
    Optional<List<String>> v = res.headers().map().entrySet().stream()
        .filter(e -> e.getKey().equalsIgnoreCase(name))
        .map(Map.Entry::getValue)
        .findFirst();
    if (v.isEmpty() || v.get().isEmpty()) return null;
    return v.get().get(0);
  }

  private static byte[] buildSignatureBase(String[] covered, long created, String keyidRaw, String alg, String method, String targetUri, String host, String date, String challenge) {
    StringBuilder sb = new StringBuilder();
    for (String item : covered) {
      String lower = asciiToLower(item);
      boolean appended = false;
      if (MessageDigest.isEqual(lower.getBytes(StandardCharsets.UTF_8), "aid-challenge".getBytes(StandardCharsets.UTF_8))) {
        sb.append("\"AID-Challenge\": ").append(challenge).append('\n');
        appended = true;
      }
      if (MessageDigest.isEqual(lower.getBytes(StandardCharsets.UTF_8), "@method".getBytes(StandardCharsets.UTF_8))) {
        sb.append("\"@method\": ").append(method).append('\n');
        appended = true;
      }
      if (MessageDigest.isEqual(lower.getBytes(StandardCharsets.UTF_8), "@target-uri".getBytes(StandardCharsets.UTF_8))) {
        sb.append("\"@target-uri\": ").append(targetUri).append('\n');
        appended = true;
      }
      if (MessageDigest.isEqual(lower.getBytes(StandardCharsets.UTF_8), "host".getBytes(StandardCharsets.UTF_8))) {
        sb.append("\"host\": ").append(host).append('\n');
        appended = true;
      }
      if (MessageDigest.isEqual(lower.getBytes(StandardCharsets.UTF_8), "date".getBytes(StandardCharsets.UTF_8))) {
        sb.append("\"date\": ").append(date).append('\n');
        appended = true;
      }
      if (!appended) {
        throw new AidError("ERR_SECURITY", "Unsupported covered field: " + item);
      }
    }
    StringBuilder quoted = new StringBuilder();
    for (int i = 0; i < covered.length; i++) {
      if (i > 0) quoted.append(' ');
      quoted.append('"').append(covered[i]).append('"');
    }
    String params = "(" + quoted + ");created=" + created + ";keyid=" + keyidRaw + ";alg=\"" + alg + "\"";
    sb.append("\"@signature-params\": ").append(params);
    return sb.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
  }

  private static PublicKey publicKeyFromRawEd25519(byte[] raw32) {
    // SPKI: 30 2a 30 05 06 03 2b 65 70 03 21 00 || raw
    byte[] prefix = new byte[] { 0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0x00 };
    byte[] spki = new byte[prefix.length + raw32.length];
    System.arraycopy(prefix, 0, spki, 0, prefix.length);
    System.arraycopy(raw32, 0, spki, prefix.length, raw32.length);
    try {
      X509EncodedKeySpec spec = new X509EncodedKeySpec(spki);
      return KeyFactory.getInstance("Ed25519").generatePublic(spec);
    } catch (Exception e) {
      throw new AidError("ERR_SECURITY", "PKA verification unavailable: Ed25519 provider missing");
    }
  }

  public static boolean performHandshake(String uri, String pka, String kid, Duration timeout) {
    return performHandshake(uri, pka, kid, timeout, null);
  }

  public static boolean performHandshake(String uri, String pka, String kid, Duration timeout, String domain) {
    if (kid == null || kid.isEmpty()) {
      return performV2Handshake(uri, pka, timeout, domain);
    }
    performV1Handshake(uri, pka, kid, timeout);
    return false;
  }

  private static void performV1Handshake(String uri, String pka, String kid, Duration timeout) {
    if (kid == null || kid.isEmpty()) throw new AidError("ERR_SECURITY", "Missing kid for PKA");
    URI u = URI.create(uri);
    HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).connectTimeout(timeout).build();
    byte[] nonce = new byte[32]; SECURE_RANDOM.nextBytes(nonce);
    String challenge = Base64.getUrlEncoder().withoutPadding().encodeToString(nonce);
    String date = java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME.format(java.time.ZonedDateTime.now(java.time.ZoneOffset.UTC));
    HttpRequest req = HttpRequest.newBuilder(URI.create(uri)).timeout(timeout).header("AID-Challenge", challenge).header("Date", date).GET().build();
    HttpResponse<byte[]> res;
    try { res = http.send(req, HttpResponse.BodyHandlers.ofByteArray()); }
    catch (Exception e) { throw new AidError("ERR_SECURITY", e.getMessage()); }
    if (res.statusCode() / 100 != 2) throw new AidError("ERR_SECURITY", "Handshake HTTP " + res.statusCode());

    SigData sd = parseSignatureHeaders(res);
    long now = System.currentTimeMillis() / 1000L;
    if (Math.abs(now - sd.created) > 300) throw new AidError("ERR_SECURITY", "Signature created timestamp outside acceptance window");
    String respDate = sd.responseDate;
    if (respDate != null) {
      try {
        long epoch = java.time.ZonedDateTime.parse(respDate, java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME.withLocale(Locale.US)).toEpochSecond();
        if (Math.abs(now - epoch) > 300) throw new AidError("ERR_SECURITY", "HTTP Date header outside acceptance window");
      } catch (java.time.format.DateTimeParseException e) {
        throw new AidError("ERR_SECURITY", "Invalid Date header");
      }
    }
    if (!MessageDigest.isEqual(sd.keyid.getBytes(StandardCharsets.UTF_8), kid.getBytes(StandardCharsets.UTF_8))) {
      throw new AidError("ERR_SECURITY", "Signature keyid mismatch");
    }
    if (!MessageDigest.isEqual("ed25519".getBytes(StandardCharsets.UTF_8), sd.alg.getBytes(StandardCharsets.UTF_8))) {
      throw new AidError("ERR_SECURITY", "Unsupported signature algorithm");
    }

    String host = u.getAuthority();
    byte[] base = buildSignatureBase(sd.covered, sd.created, sd.keyidRaw, sd.alg, "GET", uri, host, (respDate != null ? respDate : date), challenge);
    byte[] pub = multibaseDecode(pka);
    if (pub.length != 32) throw new AidError("ERR_SECURITY", "Invalid PKA length");
    PublicKey pk = publicKeyFromRawEd25519(pub);
    try {
      Signature verifier = Signature.getInstance("Ed25519");
      verifier.initVerify(pk);
      verifier.update(base);
      if (!verifier.verify(sd.signature)) throw new AidError("ERR_SECURITY", "PKA signature verification failed");
    } catch (AidError e) {
      throw e;
    } catch (Exception e) {
      throw new AidError("ERR_SECURITY", "PKA verification unavailable: " + e.getMessage());
    }
  }

  static String canonicalizeAidDomain(String domain) {
    if (domain == null) throw new AidError("ERR_SECURITY", "Invalid AID-Domain value");
    String value = asciiToLower(domain.trim());
    // Strip EXACTLY one trailing dot
    if (value.endsWith(".")) {
      value = value.substring(0, value.length() - 1);
    }
    if (value.isEmpty()) throw new AidError("ERR_SECURITY", "Invalid AID-Domain value");
    if (!value.matches("^[a-z0-9.:\\[\\]_-]+$")) {
      throw new AidError("ERR_SECURITY", "Invalid AID-Domain value");
    }
    return value;
  }

  private static boolean performV2Handshake(String uri, String pka, Duration timeout, String domain) {
    String canonical = domain != null ? canonicalizeAidDomain(domain) : null;
    String expectedKeyid = deriveAid2Keyid(pka);
    byte[] nonceBytes = new byte[32];
    SECURE_RANDOM.nextBytes(nonceBytes);
    String nonce = base64UrlEncode(nonceBytes);
    String requestUri = normalizeRequestUri(uri);
    HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).connectTimeout(timeout).build();
    HttpRequest.Builder reqBuilder =
        HttpRequest.newBuilder(URI.create(requestUri))
            .timeout(timeout)
            .header("Accept-Signature", buildAcceptSignatureV2(expectedKeyid, nonce, canonical != null))
            .header("Cache-Control", "no-store");
    if (canonical != null) {
      reqBuilder = reqBuilder.header("AID-Domain", canonical);
    }
    HttpRequest req = reqBuilder.GET().build();
    HttpResponse<byte[]> res;
    try {
      res = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
    } catch (Exception e) {
      throw new AidError("ERR_SECURITY", e.getMessage());
    }
    if (res.statusCode() >= 300 && res.statusCode() < 400) {
      throw new AidError("ERR_SECURITY", "PKA redirects are not allowed");
    }
    return verifyV2ResponseHeaders(requestUri, pka, nonce, res.statusCode(), res.headers().map(), System.currentTimeMillis() / 1000L, canonical);
  }

  static String buildAcceptSignatureV2(String keyid, String nonce) {
    return buildAcceptSignatureV2(keyid, nonce, false);
  }

  static String buildAcceptSignatureV2(String keyid, String nonce, boolean domainBound) {
    // The tag is a fixed profile identifier (RFC 9421 §2.3); domain binding is signalled by
    // including "aid-domain";req in the covered set, not by a distinct tag.
    String covered =
        domainBound
            ? "(\"@method\";req \"@target-uri\";req \"@authority\";req \"aid-domain\";req \"@status\")"
            : "(\"@method\";req \"@target-uri\";req \"@authority\";req \"@status\")";
    return "aid-pka="
        + covered
        + ";created;expires;keyid=\""
        + keyid
        + "\";alg=\"ed25519\";nonce=\""
        + nonce
        + "\";tag=\""
        + AID_PKA_TAG_V2
        + "\"";
  }

  static void verifyV2Response(
      String uri,
      String pka,
      String expectedNonce,
      int status,
      Map<String, String> headers,
      long nowEpochSeconds) {
    verifyV2ResponseHeaders(uri, pka, expectedNonce, status, singletonHeaderValues(headers), nowEpochSeconds, null);
  }

  static void verifyV2Response(
      String uri,
      String pka,
      String expectedNonce,
      int status,
      Map<String, String> headers,
      long nowEpochSeconds,
      String domain) {
    verifyV2ResponseHeaders(uri, pka, expectedNonce, status, singletonHeaderValues(headers), nowEpochSeconds, domain);
  }

  // Returning variant: surfaces the authenticated domainBound signal (derived from the signed
  // covered set) so callers/tests can assert bound vs unbound at parity with Go/TS.
  static boolean verifyV2ResponseDomainBound(
      String uri,
      String pka,
      String expectedNonce,
      int status,
      Map<String, String> headers,
      long nowEpochSeconds,
      String domain) {
    return verifyV2ResponseHeaders(
        uri, pka, expectedNonce, status, singletonHeaderValues(headers), nowEpochSeconds, domain);
  }

  private static boolean verifyV2ResponseHeaders(
      String uri,
      String pka,
      String expectedNonce,
      int status,
      Map<String, List<String>> headers,
      long nowEpochSeconds,
      String domain) {
    if (status >= 300 && status < 400) {
      throw new AidError("ERR_SECURITY", "PKA redirects are not allowed");
    }
    if (!hasNoStoreDirective(getHeader(headers, "Cache-Control"))) {
      throw new AidError("ERR_SECURITY", "PKA response must include Cache-Control: no-store");
    }

    byte[] publicKey = decodeAid2PublicKey(pka);
    String expectedKeyid = deriveAid2Keyid(pka);
    V2SigData parsed = parseV2SignatureHeaders(headers);
    if (parsed.expires <= parsed.created || parsed.expires - parsed.created > 300) {
      throw new AidError("ERR_SECURITY", "Invalid signature freshness window");
    }
    long skewSeconds = 30;
    if (parsed.created - nowEpochSeconds > skewSeconds || nowEpochSeconds - parsed.expires > skewSeconds) {
      throw new AidError("ERR_SECURITY", "Signature timestamp outside acceptance window");
    }
    if (!MessageDigest.isEqual(parsed.keyid.getBytes(StandardCharsets.UTF_8), expectedKeyid.getBytes(StandardCharsets.UTF_8))) {
      throw new AidError("ERR_SECURITY", "Signature keyid mismatch");
    }
    if (!MessageDigest.isEqual(asciiToLower(parsed.alg).getBytes(StandardCharsets.UTF_8), "ed25519".getBytes(StandardCharsets.UTF_8))) {
      throw new AidError("ERR_SECURITY", "Unsupported signature algorithm");
    }
    if (!MessageDigest.isEqual(parsed.nonce.getBytes(StandardCharsets.UTF_8), expectedNonce.getBytes(StandardCharsets.UTF_8))) {
      throw new AidError("ERR_SECURITY", "Signature nonce mismatch");
    }
    if (!MessageDigest.isEqual(
        parsed.tag.getBytes(StandardCharsets.UTF_8),
        AID_PKA_TAG_V2.getBytes(StandardCharsets.UTF_8))) {
      throw new AidError("ERR_SECURITY", "Invalid signature tag");
    }
    // Domain binding is derived from the signed covered set (aid-domain coverage), not the tag.
    boolean isDomainBound = parsed.domainBound;
    // Primary protection: a response that covers aid-domain is only meaningful when the client
    // committed to a domain via the AID-Domain header. Reject otherwise (fail closed).
    if (isDomainBound && domain == null) {
      throw new AidError("ERR_SECURITY", "Response covers aid-domain but no AID-Domain was sent");
    }

    byte[] base =
        buildV2SignatureBase(
            parsed.covered,
            parsed.signatureParamsRaw,
            "GET",
            normalizeRequestUri(uri),
            requestAuthority(uri),
            status,
            domain);
    PublicKey pk = publicKeyFromRawEd25519(publicKey);
    try {
      Signature verifier = Signature.getInstance("Ed25519");
      verifier.initVerify(pk);
      verifier.update(base);
      if (!verifier.verify(parsed.signature)) throw new AidError("ERR_SECURITY", "PKA signature verification failed");
    } catch (AidError e) {
      throw e;
    } catch (Exception e) {
      throw new AidError("ERR_SECURITY", "PKA verification unavailable: " + e.getMessage());
    }
    return isDomainBound;
  }

  private static V2SigData parseV2SignatureHeaders(Map<String, List<String>> headers) {
    String sigInput = getHeader(headers, "Signature-Input");
    String sig = getHeader(headers, "Signature");
    if (sigInput == null || sig == null) throw new AidError("ERR_SECURITY", "Missing signature headers");

    String signatureParamsRaw = extractDictionaryMember(sigInput, "aid-pka");
    if (!signatureParamsRaw.startsWith("(")) throw new AidError("ERR_SECURITY", "Invalid Signature-Input");
    int closeIndex = signatureParamsRaw.indexOf(')');
    if (closeIndex < 0) throw new AidError("ERR_SECURITY", "Invalid Signature-Input");

    String coveredRaw = signatureParamsRaw.substring(1, closeIndex).trim();
    String paramsRaw = signatureParamsRaw.substring(closeIndex + 1);
    List<V2CoveredItem> covered = new ArrayList<>();
    for (String item : splitInnerListItems(coveredRaw)) {
      covered.add(parseV2CoveredItem(item));
    }

    Map<String, String> params = parseSignatureParams(paramsRaw);
    String createdRaw = requiredSignatureParam(params, "created");
    String expiresRaw = requiredSignatureParam(params, "expires");
    String keyid = unquoteSfString(requiredSignatureParam(params, "keyid"));
    String alg = unquoteSfString(requiredSignatureParam(params, "alg"));
    String nonce = unquoteSfString(requiredSignatureParam(params, "nonce"));
    String tag = unquoteSfString(requiredSignatureParam(params, "tag"));
    boolean domainBound = validateV2CoveredSet(covered);
    if (!createdRaw.matches("\\d+") || !expiresRaw.matches("\\d+")) {
      throw new AidError("ERR_SECURITY", "Invalid Signature-Input timestamp");
    }

    String signatureRaw = extractDictionaryMember(sig, "aid-pka");
    Matcher sigMatch = Pattern.compile("^:\\s*([^:]+?)\\s*:$").matcher(signatureRaw);
    if (!sigMatch.find()) throw new AidError("ERR_SECURITY", "Invalid Signature header");

    long created;
    long expires;
    try {
      created = Long.parseLong(createdRaw);
      expires = Long.parseLong(expiresRaw);
    } catch (NumberFormatException e) {
      throw new AidError("ERR_SECURITY", "Invalid Signature-Input timestamp");
    }

    byte[] signature;
    try {
      signature = Base64.getDecoder().decode(sigMatch.group(1));
    } catch (IllegalArgumentException e) {
      throw new AidError("ERR_SECURITY", "Invalid Signature header");
    }

    V2SigData data = new V2SigData();
    data.covered = covered;
    data.signatureParamsRaw = signatureParamsRaw;
    data.created = created;
    data.expires = expires;
    data.keyid = keyid;
    data.alg = alg;
    data.nonce = nonce;
    data.tag = tag;
    data.domainBound = domainBound;
    data.signature = signature;
    return data;
  }

  private static Map<String, List<String>> singletonHeaderValues(Map<String, String> headers) {
    Map<String, List<String>> values = new HashMap<>();
    for (Map.Entry<String, String> entry : headers.entrySet()) {
      values.put(entry.getKey(), List.of(entry.getValue()));
    }
    return values;
  }

  private static String getHeader(Map<String, List<String>> headers, String name) {
    for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
      if (entry.getKey().equalsIgnoreCase(name)) {
        if (entry.getValue().isEmpty()) return null;
        return String.join(", ", entry.getValue());
      }
    }
    return null;
  }

  private static String extractDictionaryMember(String input, String label) {
    String found = null;
    String foldedLabel = asciiToLower(label);
    for (String part : splitDictionaryMembers(input)) {
      int idx = part.indexOf('=');
      if (idx <= 0) continue;
      String memberLabel = part.substring(0, idx).trim();
      if (asciiToLower(memberLabel).equals(foldedLabel)) {
        if (found != null || !memberLabel.equals(label)) {
          throw new AidError("ERR_SECURITY", "Duplicate " + label + " signature member");
        }
        found = part.substring(idx + 1).trim();
      }
    }
    if (found != null) return found;
    throw new AidError("ERR_SECURITY", "Missing " + label + " signature member");
  }

  private static List<String> splitDictionaryMembers(String input) {
    List<String> parts = new ArrayList<>();
    int start = 0;
    boolean inString = false;
    boolean escaped = false;
    int depth = 0;
    for (int i = 0; i < input.length(); i++) {
      char c = input.charAt(i);
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (c == '\\') {
          escaped = true;
        } else if (c == '"') {
          inString = false;
        }
        continue;
      }
      if (c == '"') {
        inString = true;
      } else if (c == '(') {
        depth++;
      } else if (c == ')') {
        depth--;
      } else if (c == ',' && depth == 0) {
        parts.add(input.substring(start, i).trim());
        start = i + 1;
      }
    }
    String tail = input.substring(start).trim();
    if (!tail.isEmpty()) parts.add(tail);
    return parts;
  }

  private static List<String> splitInnerListItems(String input) {
    List<String> items = new ArrayList<>();
    int start = 0;
    boolean inString = false;
    boolean escaped = false;
    for (int i = 0; i < input.length(); i++) {
      char c = input.charAt(i);
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (c == '\\') {
          escaped = true;
        } else if (c == '"') {
          inString = false;
        }
        continue;
      }
      if (c == '"') {
        inString = true;
      } else if (Character.isWhitespace(c)) {
        String item = input.substring(start, i).trim();
        if (!item.isEmpty()) items.add(item);
        start = i + 1;
      }
    }
    String tail = input.substring(start).trim();
    if (!tail.isEmpty()) items.add(tail);
    return items;
  }

  private static V2CoveredItem parseV2CoveredItem(String raw) {
    Matcher match = Pattern.compile("^\"([^\"]+)\"((?:;[A-Za-z0-9_*.-]+)*)$").matcher(raw);
    if (!match.find()) throw new AidError("ERR_SECURITY", "Invalid Signature-Input covered item");
    String name = match.group(1);
    String paramsRaw = match.group(2);
    boolean req = false;
    if (paramsRaw != null && !paramsRaw.isEmpty()) {
      for (String param : paramsRaw.split(";")) {
        if (param.isEmpty()) continue;
        if (!"req".equals(param)) {
          throw new AidError("ERR_SECURITY", "Unsupported Signature-Input covered item parameter");
        }
        if (req) {
          throw new AidError("ERR_SECURITY", "Duplicate Signature-Input covered item parameter");
        }
        req = true;
      }
    }
    return new V2CoveredItem(raw, name, req);
  }

  // Validates the covered set against the two permitted shapes and returns whether the
  // proof is domain-bound (i.e. the signed covered set includes "aid-domain";req).
  // Shape A (unbound): @method;req @target-uri;req @authority;req @status
  // Shape B (bound):   @method;req @target-uri;req @authority;req aid-domain;req @status
  // The covered set lives in the signed @signature-params, so this distinction is authenticated.
  private static boolean validateV2CoveredSet(List<V2CoveredItem> covered) {
    String[] baseNames = {"@method", "@target-uri", "@authority", "@status"};
    boolean[] baseReq = {true, true, true, false};

    boolean domainBound =
        covered.size() == baseNames.length + 1
            && covered.size() > 3
            && "aid-domain".equals(covered.get(3).name);

    String[] expectedNames;
    boolean[] expectedReq;
    if (domainBound) {
      expectedNames =
          new String[] {"@method", "@target-uri", "@authority", "aid-domain", "@status"};
      expectedReq = new boolean[] {true, true, true, true, false};
    } else {
      expectedNames = baseNames;
      expectedReq = baseReq;
    }

    if (covered.size() != expectedNames.length) {
      throw new AidError("ERR_SECURITY", "Signature-Input must cover required fields");
    }
    for (int i = 0; i < expectedNames.length; i++) {
      V2CoveredItem item = covered.get(i);
      if (!expectedNames[i].equals(item.name) || expectedReq[i] != item.req) {
        throw new AidError("ERR_SECURITY", "Signature-Input must cover required fields");
      }
    }
    return domainBound;
  }

  private static Map<String, String> parseSignatureParams(String raw) {
    Map<String, String> params = new HashMap<>();
    int index = 0;
    while (index < raw.length()) {
      while (index < raw.length() && Character.isWhitespace(raw.charAt(index))) index++;
      if (index >= raw.length()) break;
      if (raw.charAt(index) != ';') {
        throw new AidError("ERR_SECURITY", "Invalid Signature-Input parameters");
      }
      index++;
      while (index < raw.length() && Character.isWhitespace(raw.charAt(index))) index++;

      int nameStart = index;
      while (index < raw.length() && isSignatureParamNameChar(raw.charAt(index))) index++;
      String name = raw.substring(nameStart, index);
      if (name.isEmpty()) {
        throw new AidError("ERR_SECURITY", "Invalid Signature-Input parameter");
      }
      if (!isAllowedSignatureParam(name)) {
        throw new AidError("ERR_SECURITY", "Unsupported Signature-Input parameter: " + name);
      }
      if (params.containsKey(name)) {
        throw new AidError("ERR_SECURITY", "Duplicate Signature-Input parameter: " + name);
      }

      while (index < raw.length() && Character.isWhitespace(raw.charAt(index))) index++;
      if (index >= raw.length() || raw.charAt(index) != '=') {
        params.put(name, "");
        continue;
      }
      index++;
      while (index < raw.length() && Character.isWhitespace(raw.charAt(index))) index++;

      int valueStart = index;
      if (index < raw.length() && raw.charAt(index) == '"') {
        index++;
        boolean escaped = false;
        while (index < raw.length()) {
          char c = raw.charAt(index);
          if (escaped) {
            escaped = false;
          } else if (c == '\\') {
            escaped = true;
          } else if (c == '"') {
            index++;
            break;
          }
          index++;
        }
      } else {
        while (index < raw.length() && raw.charAt(index) != ';') index++;
      }
      params.put(name, raw.substring(valueStart, index).trim());
    }
    return params;
  }

  private static String requiredSignatureParam(Map<String, String> params, String name) {
    String value = params.get(name);
    if (value == null) throw new AidError("ERR_SECURITY", "Invalid Signature-Input");
    return value;
  }

  private static boolean isAllowedSignatureParam(String name) {
    return "nonce".equals(name)
        || "keyid".equals(name)
        || "alg".equals(name)
        || "created".equals(name)
        || "expires".equals(name)
        || "tag".equals(name);
  }

  private static boolean isSignatureParamNameChar(char c) {
    return (c >= 'A' && c <= 'Z')
        || (c >= 'a' && c <= 'z')
        || (c >= '0' && c <= '9')
        || c == '_'
        || c == '*'
        || c == '.'
        || c == '-';
  }

  private static String unquoteSfString(String value) {
    if (!value.startsWith("\"") || !value.endsWith("\"")) return value;
    StringBuilder out = new StringBuilder();
    boolean escaped = false;
    for (int i = 1; i < value.length() - 1; i++) {
      char c = value.charAt(i);
      if (escaped) {
        out.append(c);
        escaped = false;
      } else if (c == '\\') {
        escaped = true;
      } else {
        out.append(c);
      }
    }
    return out.toString();
  }

  private static boolean hasNoStoreDirective(String cacheControl) {
    if (cacheControl == null) return false;
    for (String part : cacheControl.split(",")) {
      String directive = part.trim().split(";", 2)[0].trim();
      if ("no-store".equalsIgnoreCase(directive)) return true;
    }
    return false;
  }

  private static byte[] buildV2SignatureBase(
      List<V2CoveredItem> covered,
      String signatureParamsRaw,
      String method,
      String targetUri,
      String authority,
      int status,
      String domain) {
    StringBuilder sb = new StringBuilder();
    for (V2CoveredItem item : covered) {
      if ("@method".equals(item.name)) {
        sb.append("\"@method\";req: ").append(method).append('\n');
      } else if ("@target-uri".equals(item.name)) {
        sb.append("\"@target-uri\";req: ").append(targetUri).append('\n');
      } else if ("@authority".equals(item.name)) {
        sb.append("\"@authority\";req: ").append(authority).append('\n');
      } else if ("aid-domain".equals(item.name)) {
        if (domain == null) {
          throw new AidError("ERR_SECURITY", "Signature covers aid-domain but no AID-Domain was sent");
        }
        sb.append("\"aid-domain\";req: ").append(domain).append('\n');
      } else if ("@status".equals(item.name)) {
        sb.append("\"@status\": ").append(status).append('\n');
      } else {
        throw new AidError("ERR_SECURITY", "Unsupported covered field: " + item.name);
      }
    }
    sb.append("\"@signature-params\": ").append(signatureParamsRaw);
    return sb.toString().getBytes(StandardCharsets.UTF_8);
  }

  private static String normalizeRequestUri(String uri) {
    try {
      URI u = URI.create(uri);
      String scheme = u.getScheme();
      if (scheme == null || u.getAuthority() == null) {
        throw new AidError("ERR_SECURITY", "Invalid URI format: " + uri);
      }
      StringBuilder canonical = new StringBuilder();
      canonical.append(asciiToLower(scheme)).append("://").append(requestAuthority(uri));
      String rawPath = u.getRawPath();
      if (rawPath != null) canonical.append(rawPath);
      String rawQuery = u.getRawQuery();
      if (rawQuery != null) canonical.append('?').append(rawQuery);
      return canonical.toString();
    } catch (AidError e) {
      throw e;
    } catch (Exception e) {
      throw new AidError("ERR_SECURITY", "Invalid URI format: " + uri);
    }
  }

  static String requestAuthority(String uri) {
    URI u = URI.create(uri);
    String host = u.getHost();
    if (host == null) host = u.getAuthority();
    host = host == null ? "" : host.toLowerCase(Locale.ROOT);
    if (host.indexOf(':') >= 0 && !host.startsWith("[") && !host.endsWith("]")) {
      host = "[" + host + "]";
    }
    int port = u.getPort();
    boolean defaultPort = ("https".equalsIgnoreCase(u.getScheme()) && (port == -1 || port == 443))
        || ("http".equalsIgnoreCase(u.getScheme()) && (port == -1 || port == 80));
    return port == -1 || defaultPort ? host : host + ":" + port;
  }

  private static String deriveAid2Keyid(String pka) {
    decodeAid2PublicKey(pka);
    String jwkThumbprintInput = "{\"crv\":\"Ed25519\",\"kty\":\"OKP\",\"x\":\"" + pka + "\"}";
    try {
      byte[] digest = MessageDigest.getInstance("SHA-256").digest(jwkThumbprintInput.getBytes(StandardCharsets.UTF_8));
      return base64UrlEncode(digest);
    } catch (Exception e) {
      throw new AidError("ERR_SECURITY", "PKA keyid derivation unavailable");
    }
  }

  private static byte[] decodeAid2PublicKey(String pka) {
    if (pka == null || pka.isEmpty() || pka.contains("=") || !pka.matches("^[A-Za-z0-9_-]+$")) {
      throw new AidError("ERR_SECURITY", "Invalid aid2 PKA encoding");
    }
    int remainder = pka.length() % 4;
    if (remainder == 1) {
      throw new AidError("ERR_SECURITY", "Invalid aid2 PKA encoding");
    }
    String padded = pka + "=".repeat((4 - remainder) % 4);
    byte[] decoded;
    try {
      decoded = Base64.getUrlDecoder().decode(padded);
    } catch (IllegalArgumentException e) {
      throw new AidError("ERR_SECURITY", "Invalid aid2 PKA encoding");
    }
    if (decoded.length != 32) throw new AidError("ERR_SECURITY", "Invalid PKA length");
    return decoded;
  }

  private static String base64UrlEncode(byte[] data) {
    return Base64.getUrlEncoder().withoutPadding().encodeToString(data);
  }
}
