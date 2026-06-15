package org.agentcommunity.aid;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

public class AidV2Test {
  private static final String VALID_V2_KEY = "ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ";

  @Test
  void parserAcceptsAid2PkaAndRejectsKid() {
    AidRecord record = Parser.parse("v=aid2;u=https://api.example.com/mcp;p=mcp;k=" + VALID_V2_KEY);

    assertEquals("aid2", record.v);
    assertEquals("https://api.example.com/mcp", record.uri);
    assertEquals("mcp", record.proto);
    assertEquals(VALID_V2_KEY, record.pka);
    assertNull(record.kid);

    AidError err =
        assertThrows(
            AidError.class,
            () -> Parser.parse("v=aid2;u=https://api.example.com/mcp;p=mcp;k=" + VALID_V2_KEY + ";i=g1"));
    assertEquals("ERR_INVALID_TXT", err.errorCode);
    assertTrue(err.getMessage().contains("kid/i"));

    AidError fullNameErr =
        assertThrows(
            AidError.class,
            () -> Parser.parse("v=aid2;u=https://api.example.com/mcp;p=mcp;k=" + VALID_V2_KEY + ";kid=g1"));
    assertEquals("ERR_INVALID_TXT", fullNameErr.errorCode);
    assertTrue(fullNameErr.getMessage().contains("kid/i"));
  }

  @Test
  void parserKeepsAid1PkaKidCompatibility() {
    AidRecord record =
        Parser.parse("v=aid1;u=https://api.example.com/mcp;p=mcp;k=z1111111111111111111111111111111111111111111;i=g1");

    assertEquals("aid1", record.v);
    assertEquals("z1111111111111111111111111111111111111111111", record.pka);
    assertEquals("g1", record.kid);

    AidError err =
        assertThrows(
            AidError.class,
            () -> Parser.parse("v=aid1;u=https://api.example.com/mcp;p=mcp;k=z1111111111111111111111111111111111111111111"));
    assertEquals("ERR_INVALID_TXT", err.errorCode);
    assertTrue(err.getMessage().contains("kid is required"));
  }

  @Test
  void aidRecordExposesVersionedContractProjections() {
    AidRecord legacy =
        new AidRecord(
            Constants.SPEC_VERSION_V1,
            "https://api.example.com/mcp",
            "mcp",
            null,
            null,
            null,
            null,
            "z1111111111111111111111111111111111111111111",
            "g1");

    AidRecord.AidRecordV1 v1 = legacy.asV1().orElseThrow();
    assertEquals("g1", v1.kid);
    assertTrue(legacy.asV2().isEmpty());

    AidRecord current =
        new AidRecord(
            Constants.SPEC_VERSION_V2,
            "https://api.example.com/mcp",
            "mcp",
            null,
            null,
            null,
            null,
            VALID_V2_KEY,
            null);

    AidRecord.AidRecordV2 v2 = current.asV2().orElseThrow();
    assertEquals(VALID_V2_KEY, v2.pka);

    AidRecord invalidV2 =
        new AidRecord(
            Constants.SPEC_VERSION_V2,
            "https://api.example.com/mcp",
            "mcp",
            null,
            null,
            null,
            null,
            VALID_V2_KEY,
            "legacy-kid");
    assertTrue(invalidV2.asV2().isEmpty());

    assertTrue(Arrays.asList(Constants.AID_RECORD_V1_CANONICAL_FIELDS).contains("kid"));
    assertTrue(Arrays.asList(Constants.AID_RECORD_V1_ALIAS_FIELDS).contains("i"));
    assertFalse(Arrays.asList(Constants.AID_RECORD_V2_CANONICAL_FIELDS).contains("kid"));
    assertFalse(Arrays.asList(Constants.AID_RECORD_V2_ALIAS_FIELDS).contains("i"));
  }

  @Test
  void discoveryProtocolQueryNamesUseUnderscoreThenBase() {
    assertEquals(List.of("_agent._mcp.example.com", "_agent.example.com"), Discovery.queryNames("example.com", "mcp"));
    assertFalse(Discovery.queryNames("example.com", "mcp").contains("_agent.mcp.example.com"));
  }

  @Test
  void discoveryTreatsDohNxDomainAsNoRecord() {
    assertTrue(Discovery.isNoRecordDohStatus(3));
    assertFalse(Discovery.isNoRecordDohStatus(2));
  }

  @Test
  void dohQueryNamePreservesFullFqdn() {
    // Regression for the substring(3) bug that stripped the leading slash AND the first two
    // characters of every FQDN (turning "_agent.example.com" into "gent.example.com"), which made
    // every DNS-first discovery query the wrong name and silently fall through to .well-known.
    assertEquals("_agent.example.com", Discovery.dohQueryName("_agent.example.com"));
    assertEquals("_agent._mcp.example.com", Discovery.dohQueryName("_agent._mcp.example.com"));

    assertEquals(
        "https://cloudflare-dns.com/dns-query?name=_agent.example.com&type=TXT",
        Discovery.dohQueryUrl("_agent.example.com"));
    assertEquals(
        "https://cloudflare-dns.com/dns-query?name=_agent._mcp.example.com&type=TXT",
        Discovery.dohQueryUrl("_agent._mcp.example.com"));
  }

  @Test
  void parserAcceptsWellFormedRecordWithPastDeprecationTimestamp() {
    // parity-1: parse() is format-only. A well-formed record whose `dep` is in the past must remain
    // parseable (it is a discovery-layer "fail gracefully" concern, not a malformed record), and it
    // must NOT raise ERR_INVALID_TXT just because the timestamp is in the past.
    AidRecord record =
        Parser.parse("v=aid1;u=https://api.example.com/mcp;p=mcp;e=2000-01-01T00:00:00Z");

    assertEquals("aid1", record.v);
    assertEquals("https://api.example.com/mcp", record.uri);
    assertEquals("2000-01-01T00:00:00Z", record.dep);

    // A malformed dep timestamp is still rejected as a format error.
    AidError err =
        assertThrows(
            AidError.class,
            () -> Parser.parse("v=aid1;u=https://api.example.com/mcp;p=mcp;e=not-a-timestamp"));
    assertEquals("ERR_INVALID_TXT", err.errorCode);
  }

  @Test
  void parserRejectsInvalidAid2PkaEncodings() {
    List<String> invalidKeys =
        List.of(
            "z1111111111111111111111111111111111111111111",
            VALID_V2_KEY + "=",
            VALID_V2_KEY.substring(0, VALID_V2_KEY.length() - 1) + "+",
            "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHw",
            "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAh");

    for (String key : invalidKeys) {
      AidError err =
          assertThrows(
              AidError.class,
              () -> Parser.parse("v=aid2;u=https://api.example.com/mcp;p=mcp;k=" + key),
              key);
      assertEquals("ERR_INVALID_TXT", err.errorCode, key);
    }
  }

  @Test
  void discoveryPrefersAid2AndAppliesAmbiguityWithinSelectedVersion() {
    Discovery.ParsedRecordWithTtl selected =
        Discovery.selectValidRecord(
            List.of(
                new Discovery.RawTxtAnswer("v=aid1;u=https://v1.example.com/mcp;p=mcp", 300),
                new Discovery.RawTxtAnswer("v=aid2;u=https://v2.example.com/mcp;p=mcp", 301)),
            Duration.ofSeconds(1),
            "_agent.example.com",
            false);

    assertEquals("aid2", selected.record.v);
    assertEquals("https://v2.example.com/mcp", selected.record.uri);
    assertEquals(301, selected.ttl);

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Discovery.selectValidRecord(
                    List.of(
                        new Discovery.RawTxtAnswer("v=aid1;u=https://v1.example.com/mcp;p=mcp", 300),
                        new Discovery.RawTxtAnswer("v=aid2;u=https://one.example.com/mcp;p=mcp", 300),
                        new Discovery.RawTxtAnswer("v=aid2;u=https://two.example.com/mcp;p=mcp", 300)),
                    Duration.ofSeconds(1),
                    "_agent.example.com",
                    false));
    assertEquals("ERR_INVALID_TXT", err.errorCode);
    assertTrue(err.getMessage().contains("Multiple valid aid2"));
  }

  @Test
  void discoveryFallsBackToAid1WhenNoValidAid2Exists() {
    Discovery.ParsedRecordWithTtl selected =
        Discovery.selectValidRecord(
            List.of(
                new Discovery.RawTxtAnswer("v=aid2;u=http://bad.example.com/mcp;p=mcp", 300),
                new Discovery.RawTxtAnswer("v=aid1;u=https://v1.example.com/mcp;p=mcp", 302)),
            Duration.ofSeconds(1),
            "_agent.example.com",
            false);

    assertEquals("aid1", selected.record.v);
    assertEquals("https://v1.example.com/mcp", selected.record.uri);
    assertEquals(302, selected.ttl);
  }

  @Test
  void discoveryRejectsOnlyMalformedAidLikeTxt() {
    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Discovery.selectValidRecord(
                    List.of(new Discovery.RawTxtAnswer("v=aid3;u=https://future.example.com/mcp;p=mcp", 300)),
                    Duration.ofSeconds(1),
                    "_agent.example.com",
                    false));

    assertEquals("ERR_INVALID_TXT", err.errorCode);
  }

  @Test
  void discoverySelectsSingleValidAid2WhenOtherAid2RecordsAreMalformed() {
    Discovery.ParsedRecordWithTtl selected =
        Discovery.selectValidRecord(
            List.of(
                new Discovery.RawTxtAnswer("v=aid2;u=https://bad.example.com/mcp;p=mcp;k=" + VALID_V2_KEY + ";kid=g1", 300),
                new Discovery.RawTxtAnswer("v=aid2;u=https://good.example.com/mcp;p=mcp;k=" + VALID_V2_KEY, 301),
                new Discovery.RawTxtAnswer("v=aid1;u=https://v1.example.com/mcp;p=mcp", 302)),
            Duration.ofSeconds(1),
            "_agent.example.com",
            false);

    assertEquals("aid2", selected.record.v);
    assertEquals("https://good.example.com/mcp", selected.record.uri);
    assertEquals(301, selected.ttl);
  }

  @Test
  void verifiesCanonicalAid2PkaVector() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");

    Handshake.verifyV2Response(
        vector.get("record").get("u").asText(),
        vector.get("record").get("k").asText(),
        vector.get("nonce").asText(),
        vector.get("response").get("status").asInt(),
        canonicalVectorHeaders(vector),
        vector.get("created").asLong() + 30);
  }

  @Test
  void canonicalizesAid2TargetUriHostDefaultPortQueryAndFragment() throws Exception {
    JsonNode vector = loadPkaVector("v2-uppercase-host-default-port-canonical-target");

    Handshake.verifyV2Response(
        vector.get("record").get("u").asText(),
        vector.get("record").get("k").asText(),
        vector.get("nonce").asText(),
        vector.get("response").get("status").asInt(),
        canonicalVectorHeaders(vector),
        vector.get("created").asLong() + 30);
  }

  @Test
  void rejectsAid2PkaResponseWithoutNoStore() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    Map<String, String> headers = new java.util.HashMap<>(canonicalVectorHeaders(vector));
    headers.remove("Cache-Control");

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(err.getMessage().contains("no-store"));
  }

  @Test
  void rejectsAid2PkaResponseWithoutMandatoryExpires() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    Map<String, String> headers = new java.util.HashMap<>(canonicalVectorHeaders(vector));
    headers.put("Signature-Input", headers.get("Signature-Input").replace(";expires=1767139260", ""));

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
  }

  @Test
  void rejectsAid2PkaResponseWithFreshnessWindowOverFiveMinutes() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    Map<String, String> headers = new java.util.HashMap<>(canonicalVectorHeaders(vector));
    headers.put("Signature-Input", headers.get("Signature-Input").replace(";expires=1767139260", ";expires=1767139501"));

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(err.getMessage().contains("freshness"));
  }

  @Test
  void rejectsAid2PkaResponseThatSignsDate() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    Map<String, String> headers = new java.util.HashMap<>(canonicalVectorHeaders(vector));
    headers.put(
        "Signature-Input",
        headers
            .get("Signature-Input")
            .replace(
                "\"@authority\";req \"@status\"",
                "\"@authority\";req \"date\" \"@status\""));

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    // "date" is not a known covered component, so it is now rejected at parse time with a
    // precise message, matching the TS and Go references (previously caught positionally by
    // validateV2CoveredSet's generic "must cover required fields").
    assertTrue(err.getMessage().contains("Unsupported covered field: date"));
  }

  @Test
  void rejectsAid2PkaRedirectStatusBeforeSignatureVerification() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    302,
                    canonicalVectorHeaders(vector),
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(err.getMessage().contains("redirects"));
  }

  @Test
  void requestAuthorityPreservesIpv6BracketsAndPorts() {
    assertEquals("[2001:db8::1]:8443", Handshake.requestAuthority("https://[2001:db8::1]:8443/mcp"));
    assertEquals("[2001:db8::1]", Handshake.requestAuthority("https://[2001:db8::1]/mcp"));
    assertEquals("[2001:db8::1]", Handshake.requestAuthority("https://[2001:db8::1]:443/mcp"));
    assertEquals("[2001:db8::1]:8080", Handshake.requestAuthority("http://[2001:db8::1]:8080/mcp"));
  }

  @Test
  void rejectsDuplicateCriticalAid2SignatureInputParams() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    Map<String, String> duplicateValues =
        Map.of(
            "created", vector.get("created").asText(),
            "expires", vector.get("expires").asText(),
            "keyid", "\"" + vector.get("key").get("jwk_thumbprint").asText() + "\"",
            "alg", "\"ed25519\"",
            "nonce", "\"" + vector.get("nonce").asText() + "\"",
            "tag", "\"aid-pka-v2\"");

    for (Map.Entry<String, String> duplicate : duplicateValues.entrySet()) {
      Map<String, String> headers = new java.util.HashMap<>(canonicalVectorHeaders(vector));
      headers.put("Signature-Input", headers.get("Signature-Input") + ";" + duplicate.getKey() + "=" + duplicate.getValue());

      AidError err =
          assertThrows(
              AidError.class,
              () ->
                  Handshake.verifyV2Response(
                      vector.get("record").get("u").asText(),
                      vector.get("record").get("k").asText(),
                      vector.get("nonce").asText(),
                      vector.get("response").get("status").asInt(),
                      headers,
                      vector.get("created").asLong() + 30),
              duplicate.getKey());

      assertEquals("ERR_SECURITY", err.errorCode, duplicate.getKey());
      assertTrue(err.getMessage().contains("Duplicate Signature-Input parameter"), duplicate.getKey());
    }
  }

  @Test
  void rejectsDuplicateAidPkaSignatureInputDictionaryMembers() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    Map<String, String> headers = new java.util.HashMap<>(canonicalVectorHeaders(vector));
    headers.put("Signature-Input", headers.get("Signature-Input") + ", " + headers.get("Signature-Input"));

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(err.getMessage().contains("Duplicate aid-pka signature member"));
  }

  @Test
  void rejectsCaseConfusedAidPkaSignatureInputDictionaryMembers() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    Map<String, String> headers = new java.util.HashMap<>(canonicalVectorHeaders(vector));
    String caseConfused = headers.get("Signature-Input").replaceFirst("aid-pka=", "AID-PKA=");
    headers.put("Signature-Input", headers.get("Signature-Input") + ", " + caseConfused);

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(err.getMessage().contains("Duplicate aid-pka signature member"));
  }

  @Test
  void rejectsDuplicateAidPkaSignatureDictionaryMembers() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    Map<String, String> headers = new java.util.HashMap<>(canonicalVectorHeaders(vector));
    headers.put("Signature", headers.get("Signature") + ", " + headers.get("Signature"));

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(err.getMessage().contains("Duplicate aid-pka signature member"));
  }

  @Test
  void rejectsCaseConfusedAidPkaSignatureDictionaryMembers() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    Map<String, String> headers = new java.util.HashMap<>(canonicalVectorHeaders(vector));
    String caseConfused = headers.get("Signature").replaceFirst("aid-pka=", "AID-PKA=");
    headers.put("Signature", headers.get("Signature") + ", " + caseConfused);

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(err.getMessage().contains("Duplicate aid-pka signature member"));
  }

  @Test
  void rejectsDuplicateAid2CoveredItemReqParam() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    String signatureInput =
        canonicalVectorHeaders(vector)
            .get("Signature-Input")
            .replace("\"@method\";req", "\"@method\";req;req");
    Map<String, String> headers = signedVectorHeaders(vector, signatureInput);

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(err.getMessage().contains("Duplicate Signature-Input covered item parameter"));
  }

  @Test
  void rejectsUppercaseAid2CoveredItemReqParam() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    String signatureInput =
        canonicalVectorHeaders(vector)
            .get("Signature-Input")
            .replace("\"@method\";req", "\"@method\";REQ");
    Map<String, String> headers = signedVectorHeaders(vector, signatureInput);

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(err.getMessage().contains("Unsupported Signature-Input covered item parameter"));
  }

  @Test
  void rejectsMixedCaseAid2CoveredItemReqParam() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    String signatureInput =
        canonicalVectorHeaders(vector)
            .get("Signature-Input")
            .replace("\"@method\";req", "\"@method\";ReQ");
    Map<String, String> headers = signedVectorHeaders(vector, signatureInput);

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(err.getMessage().contains("Unsupported Signature-Input covered item parameter"));
  }

  @Test
  void rejectsUppercaseAid2CoveredComponentName() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    String signatureInput =
        canonicalVectorHeaders(vector)
            .get("Signature-Input")
            .replace("\"@method\";req", "\"@METHOD\";req");
    Map<String, String> headers = signedVectorHeaders(vector, signatureInput);

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    // Unknown component names (component names are case-sensitive, so "@METHOD" is unknown) are
    // now rejected at parse time with a precise message, matching the TS and Go references.
    assertTrue(err.getMessage().contains("Unsupported covered field"));
  }

  @Test
  void rejectsUnknownAid2CoveredComponentNameAtParseTime() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    // Replace the @status component (slot 3 of the base covered set) with an unknown name.
    String signatureInput =
        canonicalVectorHeaders(vector)
            .get("Signature-Input")
            .replace("\"@status\"", "\"@bogus\";req");
    Map<String, String> headers = signedVectorHeaders(vector, signatureInput);

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(err.getMessage().contains("Unsupported covered field: @bogus"));
  }

  @Test
  void rejectsUnknownAid2SignatureInputTopLevelParam() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    String signatureInput =
        canonicalVectorHeaders(vector)
            .get("Signature-Input")
            .replace(";tag=\"aid-pka-v2\"", ";tag=\"aid-pka-v2\";foo=\"bar\"");
    Map<String, String> headers = signedVectorHeaders(vector, signatureInput);

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(err.getMessage().contains("Unsupported Signature-Input parameter: foo"));
  }

  @Test
  void rejectsMixedCaseAid2SignatureInputTopLevelParamNames() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    Map<String, String> replacements = Map.of("created", "Created", "keyid", "KeyID", "alg", "ALG");

    for (Map.Entry<String, String> replacement : replacements.entrySet()) {
      String signatureInput =
          canonicalVectorHeaders(vector)
              .get("Signature-Input")
              .replace(";" + replacement.getKey() + "=", ";" + replacement.getValue() + "=");
      Map<String, String> headers = signedVectorHeaders(vector, signatureInput);

      AidError err =
          assertThrows(
              AidError.class,
              () ->
                  Handshake.verifyV2Response(
                      vector.get("record").get("u").asText(),
                      vector.get("record").get("k").asText(),
                      vector.get("nonce").asText(),
                      vector.get("response").get("status").asInt(),
                      headers,
                      vector.get("created").asLong() + 30),
              replacement.getValue());

      assertEquals("ERR_SECURITY", err.errorCode, replacement.getValue());
      assertTrue(
          err.getMessage().contains("Unsupported Signature-Input parameter: " + replacement.getValue()),
          replacement.getValue());
    }
  }

  @Test
  void rejectsQuotedAid2SignatureInputTimestamps() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");

    for (String param : List.of("created", "expires")) {
      String value = vector.get(param).asText();
      String signatureInput =
          canonicalVectorHeaders(vector)
              .get("Signature-Input")
              .replace(";" + param + "=" + value, ";" + param + "=\"" + value + "\"");
      Map<String, String> headers = signedVectorHeaders(vector, signatureInput);

      AidError err =
          assertThrows(
              AidError.class,
              () ->
                  Handshake.verifyV2Response(
                      vector.get("record").get("u").asText(),
                      vector.get("record").get("k").asText(),
                      vector.get("nonce").asText(),
                      vector.get("response").get("status").asInt(),
                      headers,
                      vector.get("created").asLong() + 30),
              param);

      assertEquals("ERR_SECURITY", err.errorCode, param);
      assertTrue(err.getMessage().contains("Invalid Signature-Input timestamp"), param);
    }
  }

  @Test
  void rejectsOversizedAid2SignatureInputTimestampsWithAidError() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    String oversized = "9223372036854775807123";

    for (String param : List.of("created", "expires")) {
      String value = vector.get(param).asText();
      Map<String, String> headers = new java.util.HashMap<>(canonicalVectorHeaders(vector));
      headers.put(
          "Signature-Input",
          headers.get("Signature-Input").replace(";" + param + "=" + value, ";" + param + "=" + oversized));

      AidError err =
          assertThrows(
              AidError.class,
              () ->
                  Handshake.verifyV2Response(
                      vector.get("record").get("u").asText(),
                      vector.get("record").get("k").asText(),
                      vector.get("nonce").asText(),
                      vector.get("response").get("status").asInt(),
                      headers,
                      vector.get("created").asLong() + 30),
              param);

      assertEquals("ERR_SECURITY", err.errorCode, param);
      assertTrue(err.getMessage().contains("Invalid Signature-Input timestamp"), param);
    }
  }

  @Test
  void rejectsInvalidAid2SignatureBase64WithAidError() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    Map<String, String> headers = new java.util.HashMap<>(canonicalVectorHeaders(vector));
    headers.put("Signature", "aid-pka=:not-base64!:");

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(err.getMessage().contains("Invalid Signature header"));
  }

  @Test
  void rejectsDuplicateAidPkaMembersAcrossRepeatedSignatureInputHeaders() throws Exception {
    assertRepeatedAidPkaHeaderRejected("Signature-Input");
  }

  @Test
  void rejectsDuplicateAidPkaMembersAcrossRepeatedSignatureHeaders() throws Exception {
    assertRepeatedAidPkaHeaderRejected("Signature");
  }

  @Test
  void buildsCanonicalAid2AcceptSignatureHeader() throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    String header =
        Handshake.buildAcceptSignatureV2(
            vector.get("key").get("jwk_thumbprint").asText(), vector.get("nonce").asText(), false);

    assertEquals(vector.get("request").get("accept_signature").asText(), header);
  }

  @Test
  void buildsCanonicalAid2DbAcceptSignatureHeader() throws Exception {
    JsonNode vector = loadPkaVector("v2-db-rfc9421-domain-bound");
    String header =
        Handshake.buildAcceptSignatureV2(
            vector.get("key").get("jwk_thumbprint").asText(), vector.get("nonce").asText(), true);

    assertEquals(vector.get("request").get("accept_signature").asText(), header);
  }

  @Test
  void verifiesCanonicalAid2DbDomainBound() throws Exception {
    JsonNode vector = loadPkaVector("v2-db-rfc9421-domain-bound");
    Map<String, String> headers = new java.util.HashMap<>();
    headers.put("Signature-Input", vector.get("response").get("signature_input").asText());
    headers.put("Signature", vector.get("response").get("signature").asText());
    headers.put("Cache-Control", vector.get("response").get("cache_control").asText());

    // Should not throw, AND must report domainBound=true (the covered set includes aid-domain;req).
    boolean domainBound =
        Handshake.verifyV2ResponseDomainBound(
            vector.get("record").get("u").asText(),
            vector.get("record").get("k").asText(),
            vector.get("nonce").asText(),
            vector.get("response").get("status").asInt(),
            headers,
            vector.get("created").asLong() + 30,
            vector.get("domain").asText());

    assertTrue(domainBound, "domain-bound vector must yield domainBound=true");
  }

  @Test
  void verifiesCanonicalAid2PlainReportsDomainBoundFalse() throws Exception {
    // java-5: the unbound vector (no aid-domain in the covered set) must yield domainBound=false,
    // even when a domain is supplied. Mirrors the TS/Go assertion of the returned flag.
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    Map<String, String> headers = new java.util.HashMap<>(canonicalVectorHeaders(vector));

    boolean domainBound =
        Handshake.verifyV2ResponseDomainBound(
            vector.get("record").get("u").asText(),
            vector.get("record").get("k").asText(),
            vector.get("nonce").asText(),
            vector.get("response").get("status").asInt(),
            headers,
            vector.get("created").asLong() + 30,
            "example.com");

    assertFalse(domainBound, "unbound vector must yield domainBound=false");
  }

  @Test
  void rejectsAid2DbDomainCoverageWhenNoDomainSent() throws Exception {
    // java-3 (fail-closed): a response whose signed covered set includes aid-domain MUST be rejected
    // when the client did not send an AID-Domain header. Drives the domain-bound vector through the
    // 6-arg (no-domain) overload and asserts the exact ERR_SECURITY message, at parity with Go/TS.
    JsonNode vector = loadPkaVector("v2-db-rfc9421-domain-bound");
    Map<String, String> headers = new java.util.HashMap<>();
    headers.put("Signature-Input", vector.get("response").get("signature_input").asText());
    headers.put("Signature", vector.get("response").get("signature").asText());
    headers.put("Cache-Control", vector.get("response").get("cache_control").asText());

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    headers,
                    vector.get("created").asLong() + 30));

    assertEquals("ERR_SECURITY", err.errorCode);
    // Pin the primary fail-closed guard's exact message at parity with Go/TS. (A second defense-in-
    // depth guard in buildV2SignatureBase uses "Signature covers..."; this asserts the primary one.)
    assertEquals("Response covers aid-domain but no AID-Domain was sent", err.getMessage());
  }

  @Test
  void dnssecRequiredNoRecordRejectsWellKnownFallback() {
    Discovery.DiscoveryOptions options = new Discovery.DiscoveryOptions();
    options.requireDnssec = true;
    boolean[] called = {false};

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Discovery.resolveWellKnownFallback(
                    "example.com",
                    options,
                    new AidError("ERR_NO_RECORD", "missing"),
                    (domain, timeout) -> {
                      called[0] = true;
                      return new WellKnown.Result(
                          Parser.parse("v=aid2;u=https://fallback.example.com/mcp;p=mcp"), false);
                    }));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertFalse(called[0]);
  }

  @Test
  void dnssecRequiredLookupFailureRejectsWellKnownFallback() {
    Discovery.DiscoveryOptions options = new Discovery.DiscoveryOptions();
    options.requireDnssec = true;
    boolean[] called = {false};

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Discovery.resolveWellKnownFallback(
                    "example.com",
                    options,
                    new AidError("ERR_DNS_LOOKUP_FAILED", "network"),
                    (domain, timeout) -> {
                      called[0] = true;
                      return new WellKnown.Result(
                          Parser.parse("v=aid2;u=https://fallback.example.com/mcp;p=mcp"), false);
                    }));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertFalse(called[0]);
  }

  @Test
  void dnssecNotRequiredPreservesWellKnownFallback() {
    Discovery.DiscoveryOptions options = new Discovery.DiscoveryOptions();
    boolean[] called = {false};

    Discovery.DiscoveryResult result =
        Discovery.resolveWellKnownFallback(
            "example.com",
            options,
            new AidError("ERR_NO_RECORD", "missing"),
            (domain, timeout) -> {
              called[0] = true;
              assertEquals("example.com", domain);
              assertEquals(options.wellKnownTimeout, timeout);
              return new WellKnown.Result(
                  Parser.parse("v=aid2;u=https://fallback.example.com/mcp;p=mcp"), false);
            });

    assertTrue(called[0]);
    assertEquals("https://fallback.example.com/mcp", result.record.uri);
    assertEquals(Constants.DNS_TTL_MIN, result.ttl);
    assertEquals(Constants.DNS_SUBDOMAIN + ".example.com", result.queryName);
    assertFalse(result.domainBound);
  }

  @Test
  void wellKnownFallbackSurfacesDomainBoundFromFetcher() {
    Discovery.DiscoveryOptions options = new Discovery.DiscoveryOptions();
    String[] seenDomain = {null};

    Discovery.DiscoveryResult result =
        Discovery.resolveWellKnownFallback(
            "example.com",
            options,
            new AidError("ERR_NO_RECORD", "missing"),
            (domain, timeout) -> {
              seenDomain[0] = domain;
              // Simulate a fetcher that obtained a domain-bound PKA proof on the well-known path.
              return new WellKnown.Result(
                  Parser.parse("v=aid2;u=https://fallback.example.com/mcp;p=mcp"), true);
            });

    // The queried domain is threaded into the fetcher (which forwards it as AID-Domain),
    // and the domain-bound flag is surfaced on the DiscoveryResult instead of being hardcoded false.
    assertEquals("example.com", seenDomain[0]);
    assertTrue(result.domainBound);
  }

  @Test
  void rejectsAid2DbWhenSignedDomainDiffersFromSentDomain() throws Exception {
    // The mismatch vector covers aid-domain (single tag aid-pka-v2) but was signed over a base
    // whose aid-domain line is evil.example. The verifier rebuilds with the sent domain
    // (example.com), so Ed25519 verification fails.
    JsonNode vector = loadPkaVector("v2-db-domain-mismatch");

    AidError err =
        assertThrows(
            AidError.class,
            () ->
                Handshake.verifyV2Response(
                    vector.get("record").get("u").asText(),
                    vector.get("record").get("k").asText(),
                    vector.get("nonce").asText(),
                    vector.get("response").get("status").asInt(),
                    canonicalVectorHeaders(vector),
                    vector.get("created").asLong() + 30,
                    vector.get("domain").asText()));

    assertEquals("ERR_SECURITY", err.errorCode);
    assertTrue(
        err.getMessage().contains("PKA signature verification failed"),
        "message was: " + err.getMessage());
  }

  private static JsonNode loadPkaVector(String id) throws Exception {
    Path path = Path.of("protocol/pka_vectors.json");
    if (!Files.exists(path)) {
      path = Path.of("../../protocol/pka_vectors.json");
    }
    JsonNode root = new ObjectMapper().readTree(Files.readString(path, StandardCharsets.UTF_8));
    for (JsonNode vector : root.get("vectors")) {
      if (id.equals(vector.get("id").asText())) {
        return vector;
      }
    }
    throw new AssertionError("missing vector " + id);
  }

  private static Map<String, String> canonicalVectorHeaders(JsonNode vector) {
    JsonNode response = vector.get("response");
    return Map.of(
        "Signature-Input",
        response.get("signature_input").asText(),
        "Signature",
        response.get("signature").asText(),
        "Cache-Control",
        response.get("cache_control").asText());
  }

  private static Map<String, String> signedVectorHeaders(JsonNode vector, String signatureInput) throws Exception {
    Map<String, String> headers = new java.util.HashMap<>(canonicalVectorHeaders(vector));
    headers.put("Signature-Input", signatureInput);
    headers.put("Signature", "aid-pka=:" + signVectorSignatureBase(vector, signatureInput) + ":");
    return headers;
  }

  private static String signVectorSignatureBase(JsonNode vector, String signatureInput) throws Exception {
    return signSignatureBase(vector, javaCompatibleSignatureBase(vector, signatureInput));
  }

  private static String signSignatureBase(JsonNode vector, String signatureBase) throws Exception {
    byte[] seed = Base64.getDecoder().decode(vector.get("key").get("seed_b64").asText());
    byte[] prefix =
        new byte[] {
          0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20
        };
    byte[] pkcs8 = new byte[prefix.length + seed.length];
    System.arraycopy(prefix, 0, pkcs8, 0, prefix.length);
    System.arraycopy(seed, 0, pkcs8, prefix.length, seed.length);

    PrivateKey key = KeyFactory.getInstance("Ed25519").generatePrivate(new PKCS8EncodedKeySpec(pkcs8));
    Signature signer = Signature.getInstance("Ed25519");
    signer.initSign(key);
    signer.update(signatureBase.getBytes(StandardCharsets.UTF_8));
    return Base64.getEncoder().encodeToString(signer.sign());
  }

  private static String javaCompatibleSignatureBase(JsonNode vector, String signatureInput) {
    String base = vector.get("signature_base").asText();
    String marker = "\"@signature-params\": ";
    int signatureParamsIndex = base.indexOf(marker);
    if (signatureParamsIndex < 0) {
      throw new AssertionError("missing @signature-params in vector");
    }
    String dictionaryPrefix = "aid-pka=";
    if (!signatureInput.startsWith(dictionaryPrefix)) {
      throw new AssertionError("unexpected Signature-Input shape");
    }
    return base.substring(0, signatureParamsIndex)
        + marker
        + signatureInput.substring(dictionaryPrefix.length());
  }

  // --- WellKnown.fetchBound coverage (java-9) ---------------------------------------------------
  // These drive the public well-known fetcher end-to-end against a local HttpServer, covering the
  // happy path, the content-type guard, the 64KB size guard, the JSON-must-be-an-object guard, and
  // the narrow loopback-HTTP relaxation (allowInsecure true vs false). Previously only the internal
  // helpers had coverage; fetchBound itself was unverified.

  @Test
  void wellKnownFetchBoundHappyPathParsesHttpsRecord() throws Exception {
    HttpServer server = startWellKnownStub(
        "application/json",
        "{\"v\":\"aid1\",\"uri\":\"https://api.example.com/mcp\",\"proto\":\"mcp\"}");
    try {
      String host = "127.0.0.1:" + server.getAddress().getPort();
      // allowInsecure=true so the stub is reached over http; the record itself is https.
      WellKnown.Result result = WellKnown.fetchBound(host, Duration.ofSeconds(5), true, host);
      assertEquals("aid1", result.record.v);
      assertEquals("https://api.example.com/mcp", result.record.uri);
      assertEquals("mcp", result.record.proto);
      assertFalse(result.domainBound, "no pka means no domain-bound proof");
    } finally {
      server.stop(0);
    }
  }

  @Test
  void wellKnownFetchBoundRejectsWrongContentType() throws Exception {
    HttpServer server = startWellKnownStub(
        "text/plain",
        "{\"v\":\"aid1\",\"uri\":\"https://api.example.com/mcp\",\"proto\":\"mcp\"}");
    try {
      String host = "127.0.0.1:" + server.getAddress().getPort();
      AidError err =
          assertThrows(
              AidError.class,
              () -> WellKnown.fetchBound(host, Duration.ofSeconds(5), true, host));
      assertEquals("ERR_FALLBACK_FAILED", err.errorCode);
      assertTrue(err.getMessage().contains("content-type"));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void wellKnownFetchBoundRejectsOversizedBody() throws Exception {
    StringBuilder big = new StringBuilder("{\"v\":\"aid1\",\"uri\":\"https://api.example.com/mcp\",\"proto\":\"mcp\",\"desc\":\"");
    while (big.length() <= 64 * 1024) big.append('x');
    big.append("\"}");
    HttpServer server = startWellKnownStub("application/json", big.toString());
    try {
      String host = "127.0.0.1:" + server.getAddress().getPort();
      AidError err =
          assertThrows(
              AidError.class,
              () -> WellKnown.fetchBound(host, Duration.ofSeconds(5), true, host));
      assertEquals("ERR_FALLBACK_FAILED", err.errorCode);
      assertTrue(err.getMessage().contains("too large"));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void wellKnownFetchBoundRejectsNonObjectJson() throws Exception {
    HttpServer server = startWellKnownStub("application/json", "{}");
    try {
      String host = "127.0.0.1:" + server.getAddress().getPort();
      AidError err =
          assertThrows(
              AidError.class,
              () -> WellKnown.fetchBound(host, Duration.ofSeconds(5), true, host));
      assertEquals("ERR_FALLBACK_FAILED", err.errorCode);
      assertTrue(err.getMessage().contains("must be an object"));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void wellKnownFetchBoundAllowsLoopbackHttpWhenInsecureEnabled() throws Exception {
    // A remote-proto record carrying an http:// uri fails strict parse; the narrow loopback
    // relaxation re-validates over https and then restores the original http uri.
    HttpServer server = startWellKnownStub(
        "application/json",
        "{\"v\":\"aid1\",\"uri\":\"http://api.example.com/mcp\",\"proto\":\"mcp\"}");
    try {
      String host = "127.0.0.1:" + server.getAddress().getPort();
      WellKnown.Result result = WellKnown.fetchBound(host, Duration.ofSeconds(5), true, host);
      assertEquals("aid1", result.record.v);
      assertEquals("http://api.example.com/mcp", result.record.uri, "original http uri is restored");
      assertEquals("mcp", result.record.proto);
    } finally {
      server.stop(0);
    }
  }

  @Test
  void wellKnownFetchBoundRejectsLoopbackHttpWhenInsecureDisabled() throws Exception {
    // Same http:// remote-proto record, but the relaxation must NOT apply: the connection itself
    // is https (allowInsecure=false), and even on the parse path the http uri stays rejected.
    HttpServer server = startWellKnownStub(
        "application/json",
        "{\"v\":\"aid1\",\"uri\":\"http://api.example.com/mcp\",\"proto\":\"mcp\"}");
    try {
      String host = "127.0.0.1:" + server.getAddress().getPort();
      // allowInsecure=false makes fetchBound use https://<host>/..., which the http stub cannot
      // serve, so the fetch fails before parsing. This asserts the secure default does not silently
      // fall back to plaintext.
      AidError err =
          assertThrows(
              AidError.class,
              () -> WellKnown.fetchBound(host, Duration.ofSeconds(5), false, host));
      assertEquals("ERR_FALLBACK_FAILED", err.errorCode);
    } finally {
      server.stop(0);
    }
  }

  private static HttpServer startWellKnownStub(String contentType, String body) throws Exception {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/.well-known/agent",
        exchange -> {
          byte[] payload = body.getBytes(StandardCharsets.UTF_8);
          exchange.getResponseHeaders().add("Content-Type", contentType);
          exchange.sendResponseHeaders(200, payload.length);
          try (OutputStream output = exchange.getResponseBody()) {
            output.write(payload);
          } finally {
            exchange.close();
          }
        });
    server.start();
    return server;
  }

  private static void assertRepeatedAidPkaHeaderRejected(String repeatedHeaderName) throws Exception {
    JsonNode vector = loadPkaVector("v2-rfc9421-response-signature");
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    int port = server.getAddress().getPort();
    String uri = "http://127.0.0.1:" + port + "/mcp";

    server.createContext(
        "/mcp",
        exchange -> {
          try {
            String nonce = requiredQuotedParam(exchange.getRequestHeaders().getFirst("Accept-Signature"), "nonce");
            long created = System.currentTimeMillis() / 1000L;
            String signatureInput =
                aid2SignatureInput(
                    vector,
                    nonce,
                    created,
                    created + 60);
            String signature =
                "aid-pka=:" + signSignatureBase(vector, aid2SignatureBase(uri, 200, signatureInput)) + ":";
            byte[] body = new byte[0];
            exchange.getResponseHeaders().add("Cache-Control", "no-store");
            exchange.getResponseHeaders().add("Signature-Input", signatureInput);
            exchange.getResponseHeaders().add("Signature", signature);
            if ("Signature-Input".equals(repeatedHeaderName)) {
              exchange.getResponseHeaders().add("Signature-Input", signatureInput);
            } else if ("Signature".equals(repeatedHeaderName)) {
              exchange.getResponseHeaders().add("Signature", signature);
            } else {
              throw new AssertionError("unknown repeated header " + repeatedHeaderName);
            }
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream output = exchange.getResponseBody()) {
              output.write(body);
            }
          } catch (Exception e) {
            byte[] body = e.getMessage().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(500, body.length);
            try (OutputStream output = exchange.getResponseBody()) {
              output.write(body);
            }
          } finally {
            exchange.close();
          }
        });

    server.start();
    try {
      AidError err =
          assertThrows(
              AidError.class,
              () ->
                  Handshake.performHandshake(
                      uri,
                      vector.get("record").get("k").asText(),
                      null,
                      Duration.ofSeconds(5)));

      assertEquals("ERR_SECURITY", err.errorCode);
      assertTrue(err.getMessage().contains("Duplicate aid-pka signature member"));
    } finally {
      server.stop(0);
    }
  }

  private static String aid2SignatureInput(JsonNode vector, String nonce, long created, long expires) {
    return "aid-pka=(\"@method\";req \"@target-uri\";req \"@authority\";req \"@status\");created="
        + created
        + ";expires="
        + expires
        + ";keyid=\""
        + vector.get("key").get("jwk_thumbprint").asText()
        + "\";alg=\"ed25519\";nonce=\""
        + nonce
        + "\";tag=\"aid-pka-v2\"";
  }

  private static String aid2SignatureBase(String uri, int status, String signatureInput) {
    return "\"@method\";req: GET\n"
        + "\"@target-uri\";req: "
        + uri
        + "\n"
        + "\"@authority\";req: "
        + Handshake.requestAuthority(uri)
        + "\n"
        + "\"@status\": "
        + status
        + "\n"
        + "\"@signature-params\": "
        + signatureInput.substring("aid-pka=".length());
  }

  private static String requiredQuotedParam(String header, String name) {
    String marker = ";" + name + "=\"";
    int start = header == null ? -1 : header.indexOf(marker);
    if (start < 0) {
      throw new AssertionError("missing " + name + " parameter");
    }
    start += marker.length();
    int end = header.indexOf('"', start);
    if (end < 0) {
      throw new AssertionError("unterminated " + name + " parameter");
    }
    return header.substring(start, end);
  }
}
