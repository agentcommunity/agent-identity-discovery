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
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

import org.junit.jupiter.api.Test;

/**
 * Drives the REAL {@link Handshake} V1 PKA path against the shared {@code protocol/pka_vectors.json}
 * aid1 vectors via a local {@link HttpServer}, plus direct {@link Base58} edge-case coverage.
 *
 * <p>This replaces the former synthetic JWS toy (which imported nothing from the production package
 * and read a private 3-entry vectors.json). It is the test the Java CI workflow runs, so it must
 * exercise production code: {@code performV1Handshake}, the multibase/Base58 decode, the +/-300s
 * created/Date acceptance windows, the keyid==DNS-kid check, and the alg=ed25519 check.
 */
public class HandshakeTest {

  static final byte[] ED25519_PKCS8_PREFIX =
      new byte[] {
        0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04,
        0x20
      };

  @Test
  void drivesV1PkaVectorsAgainstRealHandshake() throws Exception {
    JsonNode root = loadVectors();
    int aid1Vectors = 0;
    for (JsonNode vector : root.get("vectors")) {
      if (!"aid1".equals(vector.get("record").get("v").asText())) continue;
      aid1Vectors++;
      runV1Vector(vector);
    }
    assertTrue(aid1Vectors >= 5, "expected the shared aid1 vectors to be exercised, found " + aid1Vectors);
  }

  private static void runV1Vector(JsonNode vector) throws Exception {
    String id = vector.get("id").asText();
    String expect = vector.get("expect").asText();
    boolean expectPass = "pass".equals(expect);

    // Compute the real Ed25519 public key from the seed and encode the PKA as multibase base58.
    byte[] seed = Base64.getDecoder().decode(vector.get("key").get("seed_b64").asText());
    byte[] publicKey = ed25519PublicKeyFromSeed(seed);
    String pka = "z" + base58Encode(publicKey);
    String recordKid = vector.get("record").get("i").asText();

    List<String> covered = new ArrayList<>();
    for (JsonNode c : vector.get("covered")) covered.add(c.asText());
    String overrideAlg = vector.has("overrideAlg") ? vector.get("overrideAlg").asText() : null;
    String overrideKeyId = vector.has("overrideKeyId") ? vector.get("overrideKeyId").asText() : null;
    boolean skewDate = "date-skew".equals(id);
    String skewHttpDate = vector.has("httpDate") ? vector.get("httpDate").asText() : null;

    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    int port = server.getAddress().getPort();
    String uri = "http://127.0.0.1:" + port + "/mcp";

    server.createContext(
        "/mcp",
        exchange -> {
          try {
            String challenge = exchange.getRequestHeaders().getFirst("AID-Challenge");
            String requestDate = exchange.getRequestHeaders().getFirst("Date");

            // Pass vectors sign within the acceptance window; the date-skew vector signs a created
            // timestamp and HTTP Date far in the past to trip the +/-300s windows.
            long created = skewDate ? vector.get("created").asLong() : System.currentTimeMillis() / 1000L;
            String responseDate;
            if (skewDate) {
              responseDate = skewHttpDate;
            } else if (requestDate != null) {
              responseDate = requestDate;
            } else {
              responseDate =
                  DateTimeFormatter.RFC_1123_DATE_TIME.format(ZonedDateTime.now(ZoneOffset.UTC));
            }

            String keyid = overrideKeyId != null ? overrideKeyId : recordKid;
            String alg = overrideAlg != null ? overrideAlg : "ed25519";

            String host = java.net.URI.create(uri).getAuthority();
            byte[] base =
                buildV1SignatureBase(covered, created, keyid, alg, uri, host, responseDate, challenge);
            String signature = base64Std(signEd25519(seed, base));

            String params =
                "(" + quoted(covered) + ");created=" + created + ";keyid=" + keyid + ";alg=\"" + alg + "\"";
            exchange.getResponseHeaders().set("Signature-Input", "sig=" + params);
            exchange.getResponseHeaders().set("Signature", "sig=:" + signature + ":");
            exchange.getResponseHeaders().set("Date", responseDate);
            byte[] body = new byte[0];
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream output = exchange.getResponseBody()) {
              output.write(body);
            }
          } catch (Exception e) {
            byte[] body = String.valueOf(e.getMessage()).getBytes(StandardCharsets.UTF_8);
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
      if (expectPass) {
        // V1 handshake returns false (domain binding is a v2 concept) and must not throw.
        boolean domainBound =
            assertDoesNotThrow(
                () -> Handshake.performHandshake(uri, pka, recordKid, Duration.ofSeconds(5)),
                id + ": expected the handshake to pass");
        assertFalse(domainBound, id + ": V1 handshake must never be domain-bound");
      } else {
        AidError err =
            assertThrows(
                AidError.class,
                () -> Handshake.performHandshake(uri, pka, recordKid, Duration.ofSeconds(5)),
                id + ": expected the handshake to be rejected");
        assertEquals("ERR_SECURITY", err.errorCode, id + ": " + err.getMessage());
      }
    } finally {
      server.stop(0);
    }
  }

  // --- Base58 direct coverage (java-6): round-trip, leading zeros, empty, invalid char ---

  @Test
  void base58DecodesEmptyToEmpty() {
    assertEquals(0, Base58.decode("").length);
  }

  @Test
  void base58PreservesLeadingZeroBytesAsOnes() {
    // Each leading '1' in base58 maps to a leading 0x00 byte.
    assertArrayEquals(new byte[] {0}, Base58.decode("1"));
    assertArrayEquals(new byte[] {0, 0, 0}, Base58.decode("111"));
  }

  @Test
  void base58RoundTripsArbitraryPayloads() {
    byte[][] payloads =
        new byte[][] {
          {0x00, 0x01, 0x02, 0x03},
          {(byte) 0xff, (byte) 0xff, (byte) 0xff},
          {0x00, 0x00, (byte) 0x80, 0x7f, 0x10},
          deterministicBytes(32)
        };
    for (byte[] payload : payloads) {
      String encoded = base58Encode(payload);
      assertArrayEquals(payload, Base58.decode(encoded), encoded);
    }
  }

  @Test
  void base58RejectsInvalidCharacters() {
    // '0', 'O', 'I', 'l' are excluded from the base58 alphabet.
    for (String bad : List.of("0", "O", "I", "l", "abc0")) {
      AidError err = assertThrows(AidError.class, () -> Base58.decode(bad), bad);
      assertEquals("ERR_SECURITY", err.errorCode, bad);
    }
  }

  // --- helpers ---

  private static JsonNode loadVectors() throws Exception {
    Path path = Path.of("protocol/pka_vectors.json");
    if (!Files.exists(path)) {
      path = Path.of("../../protocol/pka_vectors.json");
    }
    return new ObjectMapper().readTree(Files.readString(path, StandardCharsets.UTF_8));
  }

  private static byte[] buildV1SignatureBase(
      List<String> covered,
      long created,
      String keyid,
      String alg,
      String targetUri,
      String host,
      String date,
      String challenge) {
    StringBuilder sb = new StringBuilder();
    for (String item : covered) {
      switch (item.toLowerCase(java.util.Locale.ROOT)) {
        case "aid-challenge" -> sb.append("\"AID-Challenge\": ").append(challenge).append('\n');
        case "@method" -> sb.append("\"@method\": ").append("GET").append('\n');
        case "@target-uri" -> sb.append("\"@target-uri\": ").append(targetUri).append('\n');
        case "host" -> sb.append("\"host\": ").append(host).append('\n');
        case "date" -> sb.append("\"date\": ").append(date).append('\n');
        default -> throw new IllegalArgumentException("unsupported covered field: " + item);
      }
    }
    String params =
        "(" + quoted(covered) + ");created=" + created + ";keyid=" + keyid + ";alg=\"" + alg + "\"";
    sb.append("\"@signature-params\": ").append(params);
    return sb.toString().getBytes(StandardCharsets.UTF_8);
  }

  private static String quoted(List<String> covered) {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < covered.size(); i++) {
      if (i > 0) sb.append(' ');
      sb.append('"').append(covered.get(i)).append('"');
    }
    return sb.toString();
  }

  private static byte[] ed25519PublicKeyFromSeed(byte[] seed) {
    // The JDK signs with a seed-derived Ed25519 key but never exposes the raw public key, so derive
    // it via the RFC 8032 construction (see Ed25519 test helper) to build the multibase PKA.
    return Ed25519.publicKeyFromSeed(seed);
  }

  private static PrivateKey privateKeyFromSeed(byte[] seed) throws Exception {
    byte[] pkcs8 = new byte[ED25519_PKCS8_PREFIX.length + seed.length];
    System.arraycopy(ED25519_PKCS8_PREFIX, 0, pkcs8, 0, ED25519_PKCS8_PREFIX.length);
    System.arraycopy(seed, 0, pkcs8, ED25519_PKCS8_PREFIX.length, seed.length);
    return KeyFactory.getInstance("Ed25519").generatePrivate(new PKCS8EncodedKeySpec(pkcs8));
  }

  private static byte[] signEd25519(byte[] seed, byte[] message) throws Exception {
    Signature signer = Signature.getInstance("Ed25519");
    signer.initSign(privateKeyFromSeed(seed));
    signer.update(message);
    return signer.sign();
  }

  private static String base64Std(byte[] data) {
    return Base64.getEncoder().encodeToString(data);
  }

  private static byte[] deterministicBytes(int n) {
    byte[] out = new byte[n];
    for (int i = 0; i < n; i++) out[i] = (byte) (i * 7 + 3);
    return out;
  }

  // Mirrors the reference base58 encode used by the Go/TS vector drivers so the produced PKA is the
  // multibase form the production multibaseDecode/Base58.decode expects.
  private static String base58Encode(byte[] data) {
    final String alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    int zeros = 0;
    while (zeros < data.length && data[zeros] == 0) zeros++;
    int size = data.length * 138 / 100 + 1;
    byte[] b = new byte[size];
    for (byte value : data) {
      int carry = value & 0xff;
      for (int j = size - 1; j >= 0; j--) {
        carry += 256 * (b[j] & 0xff);
        b[j] = (byte) (carry % 58);
        carry /= 58;
      }
    }
    int it = 0;
    while (it < size && b[it] == 0) it++;
    StringBuilder out = new StringBuilder();
    out.append("1".repeat(zeros));
    for (; it < size; it++) out.append(alphabet.charAt(b[it] & 0xff));
    return out.toString();
  }
}
