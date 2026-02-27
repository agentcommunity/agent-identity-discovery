package org.agentcommunity.aid;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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

  @Test
  public void parsesValidExamplesFromGolden() throws IOException {
    // Load golden.json
    Path golden = Path.of("test-fixtures/golden.json");
    if (!Files.exists(golden)) {
      golden = Path.of("../../test-fixtures/golden.json");
    }
    String json = Files.readString(golden, StandardCharsets.UTF_8);

    List<GoldenRecord> records = parseGolden(json);

    for (GoldenRecord gr : records) {
      AidRecord r = Parser.parse(gr.raw);
      assertEquals("aid1", r.v, gr.name);
      assertEquals(gr.expected.get("uri"), r.uri, gr.name);
      assertEquals(gr.expected.get("proto"), r.proto, gr.name);
      if (gr.expected.containsKey("desc")) {
        assertEquals(gr.expected.get("desc"), r.desc, gr.name);
      }
    }

    for (InvalidRecord ir : parseInvalid(json)) {
      AidError err = assertThrows(AidError.class, () -> Parser.parse(ir.raw), ir.name);
      assertEquals(ir.errorCode, err.errorCode, ir.name);
    }
  }

  @Test
  public void errorMappingAndValidation() {
    // Missing v
    assertAidError("ERR_INVALID_TXT", () -> Parser.parse("uri=https://x;proto=mcp"));
    // Unsupported version
    assertAidError("ERR_INVALID_TXT", () -> Parser.parse("v=aid2;uri=https://x;proto=mcp"));
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

  // Minimal parser for the known golden.json shape
  private static List<GoldenRecord> parseGolden(String json) {
    List<GoldenRecord> list = new ArrayList<>();
    // Match each record object inside records: [ { ... }, { ... } ]
    Pattern recordPattern = Pattern.compile("\\{\\s*\\\"name\\\"\\s*:\\s*\\\"(.*?)\\\"\\s*,\\s*\\\"raw\\\"\\s*:\\s*\\\"(.*?)\\\"\\s*,\\s*\\\"expected\\\"\\s*:\\s*\\{(.*?)\\}\\s*\\}", Pattern.DOTALL);
    Matcher m = recordPattern.matcher(json);
    while (m.find()) {
      GoldenRecord gr = new GoldenRecord();
      gr.name = unescape(m.group(1));
      gr.raw = unescape(m.group(2));
      String expected = m.group(3);
      // Extract simple key-value pairs like "v":"aid1","uri":"...","proto":"...","desc":"..."
      Pattern kv = Pattern.compile("\\\"(v|uri|proto|desc)\\\"\\s*:\\s*\\\"(.*?)\\\"");
      Matcher km = kv.matcher(expected);
      while (km.find()) {
        gr.expected.put(km.group(1), unescape(km.group(2)));
      }
      list.add(gr);
    }
    return list;
  }

  private static String unescape(String s) {
    return s.replace("\\\\", "\\").replace("\\\"", "\"");
  }

  private static List<InvalidRecord> parseInvalid(String json) {
    List<InvalidRecord> list = new ArrayList<>();
    Pattern invalidPattern =
        Pattern.compile(
            "\\{\\s*\\\"name\\\"\\s*:\\s*\\\"(.*?)\\\"\\s*,\\s*\\\"raw\\\"\\s*:\\s*\\\"(.*?)\\\"\\s*,\\s*\\\"errorCode\\\"\\s*:\\s*\\\"(.*?)\\\"\\s*\\}",
            Pattern.DOTALL);
    Matcher m = invalidPattern.matcher(json);
    while (m.find()) {
      InvalidRecord ir = new InvalidRecord();
      ir.name = unescape(m.group(1));
      ir.raw = unescape(m.group(2));
      ir.errorCode = unescape(m.group(3));
      list.add(ir);
    }
    return list;
  }
}
