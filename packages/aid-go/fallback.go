package aid

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// indirection for testability
var httpClient = &http.Client{}

// fetchWellKnown fetches https://<domain>/.well-known/agent and validates JSON.
func fetchWellKnown(domain string, timeout time.Duration) (AidRecord, error) {
	url := fmt.Sprintf("https://%s/.well-known/agent", domain)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Accept", "application/json")
	client := *httpClient
	client.Timeout = timeout
	// Do not follow redirects for well-known fetch per spec guard
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := client.Do(req)
	if err != nil {
		return AidRecord{}, newAidError("ERR_FALLBACK_FAILED", err.Error())
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return AidRecord{}, newAidError("ERR_FALLBACK_FAILED", fmt.Sprintf("Well-known HTTP %d", resp.StatusCode))
	}
	if ct := strings.ToLower(resp.Header.Get("Content-Type")); ct == "" || !strings.HasPrefix(ct, "application/json") {
		return AidRecord{}, newAidError("ERR_FALLBACK_FAILED", "Invalid content-type for well-known (expected application/json)")
	}
	// Cap allocation: read at most 64KB+1 so a malicious host streaming a huge
	// body cannot exhaust memory before the size check runs.
	data, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024+1))
	if err != nil {
		return AidRecord{}, newAidError("ERR_FALLBACK_FAILED", err.Error())
	}
	if len(data) > 64*1024 {
		return AidRecord{}, newAidError("ERR_FALLBACK_FAILED", "Well-known response too large (>64KB)")
	}
	var doc map[string]any
	if err := json.Unmarshal(data, &doc); err != nil {
		return AidRecord{}, newAidError("ERR_FALLBACK_FAILED", "Invalid JSON in well-known response")
	}
	if doc == nil {
		return AidRecord{}, newAidError("ERR_FALLBACK_FAILED", "Well-known JSON must be an object")
	}
	// canonicalize accepting alias keys
	getStr := func(k string) (string, bool) {
		if v, ok := doc[k]; ok {
			if s, ok := v.(string); ok {
				return s, true
			}
		}
		return "", false
	}
	raw := map[string]string{}
	if v, ok := getStr("v"); ok {
		raw["v"] = v
	}
	if u, ok := getStr("uri"); ok {
		raw["uri"] = u
	} else if u, ok := getStr("u"); ok {
		raw["uri"] = u
	}
	if p, ok := getStr("proto"); ok {
		raw["proto"] = p
	} else if p, ok := getStr("p"); ok {
		raw["proto"] = p
	}
	if a, ok := getStr("auth"); ok {
		raw["auth"] = a
	} else if a, ok := getStr("a"); ok {
		raw["auth"] = a
	}
	if s, ok := getStr("desc"); ok {
		raw["desc"] = s
	} else if s, ok := getStr("s"); ok {
		raw["desc"] = s
	}
	if d, ok := getStr("docs"); ok {
		raw["docs"] = d
	} else if d, ok := getStr("d"); ok {
		raw["docs"] = d
	}
	if e, ok := getStr("dep"); ok {
		raw["dep"] = e
	} else if e, ok := getStr("e"); ok {
		raw["dep"] = e
	}
	if k, ok := getStr("pka"); ok {
		raw["pka"] = k
	} else if k, ok := getStr("k"); ok {
		raw["pka"] = k
	}
	if i, ok := getStr("kid"); ok {
		raw["kid"] = i
	} else if i, ok := getStr("i"); ok {
		raw["kid"] = i
	}

	return ValidateRecord(raw)
}
