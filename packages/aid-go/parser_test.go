package aid

import (
	"strings"
	"testing"
)

const validAid2Pka = "ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ"

func TestParseValidRecord(t *testing.T) {
	txt := "v=aid1;uri=https://api.example.com/mcp;proto=mcp;auth=pat;desc=Test Agent"
	rec, err := Parse(txt)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.Proto != "mcp" || rec.Auth != "pat" {
		t.Fatalf("unexpected record %+v", rec)
	}
}

func TestParseAliasP(t *testing.T) {
	txt := "v=aid1;uri=https://api.example.com/mcp;p=mcp"
	rec, err := Parse(txt)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.Proto != "mcp" {
		t.Fatalf("proto mismatch")
	}
}

func TestInvalidProto(t *testing.T) {
	txt := "v=aid1;uri=https://api.example.com/mcp;proto=unknown"
	_, err := Parse(txt)
	if err == nil {
		t.Fatalf("expected error")
	}
}

func TestParseMalformedPairReturnsError(t *testing.T) {
	// A bare token (no '=') in the TXT record must surface a typed
	// ERR_INVALID_TXT error, not panic the calling goroutine.
	txt := "v=aid2;garbage;u=https://x.example.com/mcp;p=mcp"
	_, err := Parse(txt)
	if err == nil {
		t.Fatalf("expected error for malformed pair")
	}
	aidErr, ok := err.(*AidError)
	if !ok {
		t.Fatalf("expected *AidError, got %T: %v", err, err)
	}
	if aidErr.Symbol != "ERR_INVALID_TXT" {
		t.Fatalf("expected ERR_INVALID_TXT, got %s", aidErr.Symbol)
	}
}

func TestParseRejectsDuplicateKey(t *testing.T) {
	// A repeated key (here the canonical version field) must be rejected
	// rather than silently last-write-wins, matching the other 5 SDKs.
	txt := "v=aid1;v=aid2;u=https://x.example.com/mcp;p=mcp"
	_, err := Parse(txt)
	if err == nil {
		t.Fatalf("expected error for duplicate key")
	}
	aidErr, ok := err.(*AidError)
	if !ok {
		t.Fatalf("expected *AidError, got %T: %v", err, err)
	}
	if aidErr.Symbol != "ERR_INVALID_TXT" {
		t.Fatalf("expected ERR_INVALID_TXT, got %s", aidErr.Symbol)
	}
	if !strings.Contains(aidErr.Msg, "Duplicate key: v") {
		t.Fatalf("expected duplicate-key message, got %q", aidErr.Msg)
	}
}

func TestParseRejectsEmptyKey(t *testing.T) {
	// A pair with an empty key (e.g. "=foo") must be rejected.
	txt := "=foo;v=aid2;u=https://x.example.com/mcp;p=mcp"
	_, err := Parse(txt)
	if err == nil {
		t.Fatalf("expected error for empty key")
	}
	aidErr, ok := err.(*AidError)
	if !ok {
		t.Fatalf("expected *AidError, got %T: %v", err, err)
	}
	if aidErr.Symbol != "ERR_INVALID_TXT" {
		t.Fatalf("expected ERR_INVALID_TXT, got %s", aidErr.Symbol)
	}
}

func TestParseRejectsEmptyValue(t *testing.T) {
	// A pair with an empty value (e.g. "v=") must be rejected.
	txt := "v=;u=https://x.example.com/mcp;p=mcp"
	_, err := Parse(txt)
	if err == nil {
		t.Fatalf("expected error for empty value")
	}
	aidErr, ok := err.(*AidError)
	if !ok {
		t.Fatalf("expected *AidError, got %T: %v", err, err)
	}
	if aidErr.Symbol != "ERR_INVALID_TXT" {
		t.Fatalf("expected ERR_INVALID_TXT, got %s", aidErr.Symbol)
	}
}

func TestParseValidAid2Record(t *testing.T) {
	txt := "v=aid2;u=https://api.example.com/mcp;p=mcp;a=oauth2_code"
	rec, err := Parse(txt)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.V != "aid2" || rec.URI != "https://api.example.com/mcp" || rec.Proto != "mcp" || rec.Auth != "oauth2_code" {
		t.Fatalf("unexpected record %+v", rec)
	}
}

func TestParseAid2PkaBase64URLWithoutKid(t *testing.T) {
	txt := "v=aid2;u=https://api.example.com/mcp;p=mcp;k=" + validAid2Pka
	rec, err := Parse(txt)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.V != "aid2" || rec.Pka != validAid2Pka || rec.Kid != "" {
		t.Fatalf("unexpected record %+v", rec)
	}
}

func TestParseRejectsKidOnAid2(t *testing.T) {
	for _, txt := range []string{
		"v=aid2;u=https://api.example.com/mcp;p=mcp;k=" + validAid2Pka + ";kid=g1",
		"v=aid2;u=https://api.example.com/mcp;p=mcp;k=" + validAid2Pka + ";i=g1",
	} {
		_, err := Parse(txt)
		if err == nil {
			t.Fatalf("expected error for %s", txt)
		}
	}
}

func TestParseAid1KeepsLegacyPkaKid(t *testing.T) {
	txt := "v=aid1;u=https://api.example.com/mcp;p=mcp;k=z1111111111111111111111111111111111111111111;i=g1"
	rec, err := Parse(txt)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.V != "aid1" || rec.Pka != "z1111111111111111111111111111111111111111111" || rec.Kid != "g1" {
		t.Fatalf("unexpected record %+v", rec)
	}
}

func TestParseRejectsInvalidAid2Pka(t *testing.T) {
	tests := []string{
		"z1111111111111111111111111111111111111111111",
		validAid2Pka + "=",
		validAid2Pka[:len(validAid2Pka)-1] + "+",
		"AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHw",
		"AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAh",
	}
	for _, key := range tests {
		_, err := Parse("v=aid2;u=https://api.example.com/mcp;p=mcp;k=" + key)
		if err == nil {
			t.Fatalf("expected error for key %q", key)
		}
	}
}

func TestAidRecordVersionedContract(t *testing.T) {
	legacy := AidRecord{
		V:     SpecVersionV1,
		URI:   "https://api.example.com/mcp",
		Proto: "mcp",
		Pka:   "z1111111111111111111111111111111111111111111",
		Kid:   "g1",
	}

	v1, ok := legacy.AsV1()
	if !ok {
		t.Fatalf("expected aid1 compatibility record to project as AidRecordV1")
	}
	if v1.Kid != "g1" {
		t.Fatalf("expected aid1 projection to preserve kid, got %+v", v1)
	}
	if _, ok := legacy.AsV2(); ok {
		t.Fatalf("aid1 record must not project as AidRecordV2")
	}

	current := AidRecord{
		V:     SpecVersionV2,
		URI:   "https://api.example.com/mcp",
		Proto: "mcp",
		Pka:   validAid2Pka,
	}

	v2, ok := current.AsV2()
	if !ok {
		t.Fatalf("expected aid2 record without kid to project as AidRecordV2")
	}
	if v2.Pka != validAid2Pka {
		t.Fatalf("expected aid2 projection to preserve pka, got %+v", v2)
	}

	invalidV2 := current
	invalidV2.Kid = "legacy-kid"
	if _, ok := invalidV2.AsV2(); ok {
		t.Fatalf("aid2 projection must reject compatibility records carrying kid")
	}

	if containsString(AidRecordV2CanonicalFields, "kid") || containsString(AidRecordV2AliasFields, "i") {
		t.Fatalf("aid2 generated record metadata must not include kid/i")
	}
	if !containsString(AidRecordV1CanonicalFields, "kid") || !containsString(AidRecordV1AliasFields, "i") {
		t.Fatalf("aid1 generated record metadata must retain kid/i")
	}
}

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}
