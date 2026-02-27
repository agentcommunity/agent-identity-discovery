package aid

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

type parityRecord struct {
	Name     string                 `json:"name"`
	Raw      string                 `json:"raw"`
	Expected map[string]interface{} `json:"expected"`
}

type parityRoot struct {
	Records []parityRecord `json:"records"`
	Invalid []struct {
		Name      string `json:"name"`
		Raw       string `json:"raw"`
		ErrorCode string `json:"errorCode"`
	} `json:"invalid"`
}

func TestParity(t *testing.T) {
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	fixturePath := filepath.Join(cwd, "..", "..", "test-fixtures", "golden.json")
	data, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var fx parityRoot
	if err := json.Unmarshal(data, &fx); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, rec := range fx.Records {
		parsed, err := Parse(rec.Raw)
		if err != nil {
			t.Errorf("%s: parse error %v", rec.Name, err)
			continue
		}
		got := map[string]interface{}{
			"v":     parsed.V,
			"uri":   parsed.URI,
			"proto": parsed.Proto,
		}
		if parsed.Auth != "" {
			got["auth"] = parsed.Auth
		}
		if parsed.Desc != "" {
			got["desc"] = parsed.Desc
		}
		if parsed.Docs != "" {
			got["docs"] = parsed.Docs
		}
		if parsed.Dep != "" {
			got["dep"] = parsed.Dep
		}
		if parsed.Pka != "" {
			got["pka"] = parsed.Pka
		}
		if parsed.Kid != "" {
			got["kid"] = parsed.Kid
		}
		if !reflect.DeepEqual(got, rec.Expected) {
			jg, _ := json.Marshal(got)
			je, _ := json.Marshal(rec.Expected)
			t.Errorf("%s: mismatch\n got %s\nwant %s", rec.Name, string(jg), string(je))
		}
	}

	for _, rec := range fx.Invalid {
		_, err := Parse(rec.Raw)
		if err == nil {
			t.Errorf("%s: expected parse error", rec.Name)
			continue
		}
		aidErr, ok := err.(*AidError)
		if !ok {
			t.Errorf("%s: expected AidError, got %T", rec.Name, err)
			continue
		}
		if rec.ErrorCode != "" && aidErr.Symbol != rec.ErrorCode {
			t.Errorf("%s: got error %s, want %s", rec.Name, aidErr.Symbol, rec.ErrorCode)
		}
	}
}
