package org.agentcommunity.aid;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;

public class ParityTest {
  static class GoldenRecord {
    public String name;
    public String raw;
    public Map<String, String> expected = new HashMap<>();
  }

  static class InvalidRecord {
    public String name;
    public String raw;
    public String errorCode;
  }

  private static final ObjectMapper MAPPER = new ObjectMapper();

  @Test
  public void parsesValidExamplesFromGolden() throws IOException {
    JsonNode root = MAPPER.readTree(readGolden());

    List<GoldenRecord> records = parseGolden(root);

    for (GoldenRecord gr : records) {
      AidRecord r = Parser.parse(gr.raw);
      assertEquals(gr.expected.get("v"), r.v, gr.name);
      assertEquals(gr.expected.get("uri"), r.uri, gr.name);
      assertEquals(gr.expected.get("proto"), r.proto, gr.name);
      if (gr.expected.containsKey("desc")) {
        assertEquals(gr.expected.get("desc"), r.desc, gr.name);
      }
    }

    for (InvalidRecord ir : parseInvalid(root)) {
      AidError err = assertThrows(AidError.class, () -> Parser.parse(ir.raw), ir.name);
      assertEquals(ir.errorCode, err.errorCode, ir.name);
    }
  }

  @Test
  public void errorMappingAndValidation() {
    // Missing v
    assertAidError("ERR_INVALID_TXT", () -> Parser.parse("uri=https://x;proto=mcp"));
    // Unsupported version
    assertAidError("ERR_INVALID_TXT", () -> Parser.parse("v=aid3;uri=https://x;proto=mcp"));
    // Unsupported protocol
    assertAidError("ERR_UNSUPPORTED_PROTO", () -> Parser.parse("v=aid1;uri=https://x;proto=unknown"));
    // Both proto and p
    Executable both = () -> Parser.parse("v=aid1;uri=https://x;proto=mcp;p=mcp");
    AidError e = assertThrows(AidError.class, both);
    assertEquals("ERR_INVALID_TXT", e.errorCode);
    assertTrue(e.getMessage().contains("both \"proto\" and \"p\""));
    // Invalid auth
    assertAidError("ERR_INVALID_TXT", () -> Parser.parse("v=aid1;uri=https://x;proto=mcp;auth=invalid"));
    // Remote with non-https
    assertAidError("ERR_INVALID_TXT", () -> Parser.parse("v=aid1;uri=http://x;proto=mcp"));
    // Local with invalid scheme
    assertAidError("ERR_INVALID_TXT", () -> Parser.parse("v=aid1;uri=file://x;proto=local"));
    // Empty value
    assertAidError("ERR_INVALID_TXT", () -> Parser.parse("v=aid1;uri=;proto=local"));
  }

  private static void assertAidError(String code, Executable ex) {
    AidError err = assertThrows(AidError.class, ex);
    assertEquals(code, err.errorCode);
    assertTrue(err.code >= 1000 && err.code <= 2000);
  }

  private static String readGolden() throws IOException {
    Path golden = Path.of("test-fixtures/golden.json");
    if (!Files.exists(golden)) {
      golden = Path.of("../../test-fixtures/golden.json");
    }
    return Files.readString(golden, StandardCharsets.UTF_8);
  }

  // Parse the records[] array with a real JSON parser so every fixture is exercised.
  // (The previous hand-rolled regex dropped pka-missing-kid and produced a bogus
  // cross-entry "simple" match, silently skipping real cases.)
  private static List<GoldenRecord> parseGolden(JsonNode root) {
    List<GoldenRecord> list = new ArrayList<>();
    for (JsonNode n : root.path("records")) {
      GoldenRecord gr = new GoldenRecord();
      gr.name = n.path("name").asText();
      gr.raw = n.path("raw").asText();
      JsonNode expected = n.path("expected");
      for (String key : new String[] {"v", "uri", "proto", "desc"}) {
        JsonNode v = expected.get(key);
        if (v != null && !v.isNull()) {
          gr.expected.put(key, v.asText());
        }
      }
      list.add(gr);
    }
    return list;
  }

  private static List<InvalidRecord> parseInvalid(JsonNode root) {
    List<InvalidRecord> list = new ArrayList<>();
    for (JsonNode n : root.path("invalid")) {
      InvalidRecord ir = new InvalidRecord();
      ir.name = n.path("name").asText();
      ir.raw = n.path("raw").asText();
      ir.errorCode = n.path("errorCode").asText();
      list.add(ir);
    }
    return list;
  }
}
