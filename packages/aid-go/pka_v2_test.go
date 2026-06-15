package aid

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type pkaV2Vector struct {
	ID     string `json:"id"`
	Record struct {
		V string `json:"v"`
		U string `json:"u"`
		P string `json:"p"`
		K string `json:"k"`
	} `json:"record"`
	Domain  string `json:"domain"`
	Request struct {
		Method          string `json:"method"`
		TargetURI       string `json:"target_uri"`
		Authority       string `json:"authority"`
		AidDomain       string `json:"aid_domain"`
		AcceptSignature string `json:"accept_signature"`
		CacheControl    string `json:"cache_control"`
	} `json:"request"`
	Response struct {
		Status         int    `json:"status"`
		CacheControl   string `json:"cache_control"`
		SignatureInput string `json:"signature_input"`
		Signature      string `json:"signature"`
	} `json:"response"`
	Created int64  `json:"created"`
	Nonce   string `json:"nonce"`
	Expect  string `json:"expect"`
}

func loadPKAV2Vector(t *testing.T, id string) pkaV2Vector {
	t.Helper()
	path := filepath.Join("..", "..", "protocol", "pka_vectors.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var root struct {
		Vectors []json.RawMessage `json:"vectors"`
	}
	if err := json.Unmarshal(raw, &root); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	for _, item := range root.Vectors {
		var probe struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(item, &probe); err != nil {
			t.Fatalf("parse vector id: %v", err)
		}
		if probe.ID != id {
			continue
		}
		var vector pkaV2Vector
		if err := json.Unmarshal(item, &vector); err != nil {
			t.Fatalf("parse v2 vector: %v", err)
		}
		return vector
	}
	t.Fatalf("missing v2 PKA vector %q", id)
	return pkaV2Vector{}
}

func loadCanonicalPKAV2Vector(t *testing.T) pkaV2Vector {
	t.Helper()
	return loadPKAV2Vector(t, "v2-rfc9421-response-signature")
}

func withPKAV2VectorClockAndNonce(t *testing.T, vector pkaV2Vector) {
	t.Helper()
	nonce, err := base64.RawURLEncoding.DecodeString(vector.Nonce)
	if err != nil {
		t.Fatalf("decode vector nonce: %v", err)
	}
	oldRand := pkaRandRead
	oldNow := pkaNowUnix
	pkaRandRead = func(dst []byte) (int, error) {
		copy(dst, nonce)
		return len(dst), nil
	}
	pkaNowUnix = func() int64 {
		return vector.Created
	}
	t.Cleanup(func() {
		pkaRandRead = oldRand
		pkaNowUnix = oldNow
	})
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestPKAV2CanonicalRFC9421ResponseSignature(t *testing.T) {
	vector := loadCanonicalPKAV2Vector(t)
	withPKAV2VectorClockAndNonce(t, vector)

	oldClient := httpClient
	httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.Method != vector.Request.Method {
			t.Fatalf("expected method %s got %s", vector.Request.Method, req.Method)
		}
		if req.URL.String() != vector.Request.TargetURI {
			t.Fatalf("expected target URI %s got %s", vector.Request.TargetURI, req.URL.String())
		}
		if req.Header.Get("Accept-Signature") != vector.Request.AcceptSignature {
			t.Fatalf("unexpected Accept-Signature: %s", req.Header.Get("Accept-Signature"))
		}
		if req.Header.Get("Cache-Control") != vector.Request.CacheControl {
			t.Fatalf("unexpected Cache-Control: %s", req.Header.Get("Cache-Control"))
		}
		if req.Header.Get("AID-Challenge") != "" {
			t.Fatalf("aid2 request must not send AID-Challenge")
		}
		if req.Header.Get("Date") != "" {
			t.Fatalf("aid2 request must not send Date")
		}
		headers := http.Header{}
		headers.Set("Cache-Control", vector.Response.CacheControl)
		headers.Set("Signature-Input", vector.Response.SignatureInput)
		headers.Set("Signature", vector.Response.Signature)
		return &http.Response{
			StatusCode: vector.Response.Status,
			Header:     headers,
			Body:       io.NopCloser(strings.NewReader("")),
		}, nil
	})}
	t.Cleanup(func() { httpClient = oldClient })

	if _, err := performPKAHandshake(vector.Record.U, vector.Record.K, "", "", time.Second); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPKAV2CanonicalizesUppercaseHostDefaultPortAndFragment(t *testing.T) {
	vector := loadPKAV2Vector(t, "v2-uppercase-host-default-port-canonical-target")
	withPKAV2VectorClockAndNonce(t, vector)

	oldClient := httpClient
	httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.Method != vector.Request.Method {
			t.Fatalf("expected method %s got %s", vector.Request.Method, req.Method)
		}
		if req.URL.String() != vector.Request.TargetURI {
			t.Fatalf("expected target URI %s got %s", vector.Request.TargetURI, req.URL.String())
		}
		if req.Header.Get("Accept-Signature") != vector.Request.AcceptSignature {
			t.Fatalf("unexpected Accept-Signature: %s", req.Header.Get("Accept-Signature"))
		}
		headers := http.Header{}
		headers.Set("Cache-Control", vector.Response.CacheControl)
		headers.Set("Signature-Input", vector.Response.SignatureInput)
		headers.Set("Signature", vector.Response.Signature)
		return &http.Response{
			StatusCode: vector.Response.Status,
			Header:     headers,
			Body:       io.NopCloser(strings.NewReader("")),
		}, nil
	})}
	t.Cleanup(func() { httpClient = oldClient })

	if _, err := performPKAHandshake(vector.Record.U, vector.Record.K, "", "", time.Second); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestPKAV1ChallengeUsesCryptoRandomness(t *testing.T) {
	expectedNonce := make([]byte, 32)
	for i := range expectedNonce {
		expectedNonce[i] = byte(i)
	}
	expectedChallenge := base64.RawURLEncoding.EncodeToString(expectedNonce)

	oldRand := pkaRandRead
	pkaRandRead = func(dst []byte) (int, error) {
		copy(dst, expectedNonce)
		return len(dst), nil
	}
	t.Cleanup(func() { pkaRandRead = oldRand })

	oldClient := httpClient
	httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if got := req.Header.Get("AID-Challenge"); got != expectedChallenge {
			t.Fatalf("expected challenge %q, got %q", expectedChallenge, got)
		}
		return &http.Response{
			StatusCode: http.StatusTeapot,
			Header:     http.Header{},
			Body:       io.NopCloser(strings.NewReader("")),
		}, nil
	})}
	t.Cleanup(func() { httpClient = oldClient })

	_ = performV1PKAHandshake("https://agent.example/agent", "zunused", "kid", time.Second)
}

func TestPKAV2RejectsRedirectResponse(t *testing.T) {
	vector := loadCanonicalPKAV2Vector(t)
	withPKAV2VectorClockAndNonce(t, vector)

	oldClient := httpClient
	httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusFound,
			Header:     http.Header{"Location": []string{"https://other.example.com"}},
			Body:       io.NopCloser(strings.NewReader("")),
		}, nil
	})}
	t.Cleanup(func() { httpClient = oldClient })

	_, err := performPKAHandshake(vector.Record.U, vector.Record.K, "", "", time.Second)
	if err == nil {
		t.Fatalf("expected redirect error")
	}
	aidErr, ok := err.(*AidError)
	if !ok {
		t.Fatalf("expected AidError, got %T", err)
	}
	if aidErr.Symbol != "ERR_SECURITY" {
		t.Fatalf("expected ERR_SECURITY, got %s", aidErr.Symbol)
	}
}

func TestPKAV2RequestAuthorityPreservesIPv6LiteralAndNonDefaultPort(t *testing.T) {
	authority, err := requestAuthority("https://[2001:db8::1]:8443/agent")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if authority != "[2001:db8::1]:8443" {
		t.Fatalf("expected bracketed IPv6 authority with port, got %q", authority)
	}
}

func TestPKAV2RejectsDuplicateCriticalSignatureInputParams(t *testing.T) {
	criticalParams := map[string]string{
		"created": `1`,
		"expires": `2`,
		"keyid":   `"key"`,
		"alg":     `"ed25519"`,
		"nonce":   `"nonce"`,
		"tag":     `"aid-pka-v2"`,
	}
	for param, value := range criticalParams {
		t.Run(param, func(t *testing.T) {
			params := `;created=1;expires=2;keyid="key";alg="ed25519";nonce="nonce";tag="aid-pka-v2"`
			params += `;` + param + `=` + value
			headers := http.Header{}
			headers.Set("Signature-Input", `aid-pka=("@method";req "@target-uri";req "@authority";req "@status")`+params)
			headers.Set("Signature", `aid-pka=:`+base64.StdEncoding.EncodeToString(make([]byte, ed25519.SignatureSize))+`:`)

			if _, err := parseV2SignatureHeaders(headers); err == nil {
				t.Fatalf("expected duplicate %s to be rejected", param)
			}
		})
	}
}

func TestPKAV2RejectsInvalidCoveredItems(t *testing.T) {
	cases := map[string]string{
		"duplicate req parameter":  `("@method";req;req "@target-uri";req "@authority";req "@status")`,
		"uppercase req parameter":  `("@method";REQ "@target-uri";req "@authority";req "@status")`,
		"mixed-case req parameter": `("@method";ReQ "@target-uri";req "@authority";req "@status")`,
		"unknown item parameter":   `("@method";req;foo "@target-uri";req "@authority";req "@status")`,
		"duplicate covered name":   `("@method";req "@method";req "@authority";req "@status")`,
		"missing required item":    `("@method";req "@authority";req "@status")`,
		"legacy date field":        `("@method";req "@target-uri";req "@authority";req "date";req)`,
		"extra covered field":      `("@method";req "@target-uri";req "@authority";req "@query";req)`,
	}
	for name, covered := range cases {
		t.Run(name, func(t *testing.T) {
			headers := http.Header{}
			headers.Set("Signature-Input", `aid-pka=`+covered+`;created=1;expires=2;keyid="key";alg="ed25519";nonce="nonce";tag="aid-pka-v2"`)
			headers.Set("Signature", `aid-pka=:`+base64.StdEncoding.EncodeToString(make([]byte, ed25519.SignatureSize))+`:`)

			if _, err := parseV2SignatureHeaders(headers); err == nil {
				t.Fatalf("expected invalid covered item set to be rejected")
			}
		})
	}
}

func TestPKAV2RejectsNonExactCoveredComponentNames(t *testing.T) {
	cases := map[string]string{
		"uppercase method":  `("@METHOD";req "@target-uri";req "@authority";req "@status")`,
		"mixed-case target": `("@method";req "@Target-URI";req "@authority";req "@status")`,
	}
	for name, covered := range cases {
		t.Run(name, func(t *testing.T) {
			headers := http.Header{}
			headers.Set("Signature-Input", `aid-pka=`+covered+`;created=1;expires=2;keyid="key";alg="ed25519";nonce="nonce";tag="aid-pka-v2"`)
			headers.Set("Signature", `aid-pka=:`+base64.StdEncoding.EncodeToString(make([]byte, ed25519.SignatureSize))+`:`)

			if _, err := parseV2SignatureHeaders(headers); err == nil {
				t.Fatalf("expected non-exact covered component name to be rejected")
			}
		})
	}
}

func TestPKAV2RejectsEmptyCoveredItemParameterSegments(t *testing.T) {
	cases := map[string]string{
		"empty before req":   `("@method";;req "@target-uri";req "@authority";req "@status")`,
		"trailing after req": `("@method";req; "@target-uri";req "@authority";req "@status")`,
	}
	for name, covered := range cases {
		t.Run(name, func(t *testing.T) {
			headers := http.Header{}
			headers.Set("Signature-Input", `aid-pka=`+covered+`;created=1;expires=2;keyid="key";alg="ed25519";nonce="nonce";tag="aid-pka-v2"`)
			headers.Set("Signature", `aid-pka=:`+base64.StdEncoding.EncodeToString(make([]byte, ed25519.SignatureSize))+`:`)

			if _, err := parseV2SignatureHeaders(headers); err == nil {
				t.Fatalf("expected empty covered item parameter segment to be rejected")
			}
		})
	}
}

func TestPKAV1RejectsDuplicateCriticalSignatureInputParams(t *testing.T) {
	criticalParams := map[string]string{
		"created": `1`,
		"keyid":   `"kid"`,
		"alg":     `"ed25519"`,
	}
	for param, value := range criticalParams {
		t.Run(param, func(t *testing.T) {
			sigInput := `sig=("aid-challenge" "@method" "@target-uri" "host" "date");created=1;keyid="kid";alg="ed25519";` + param + `=` + value
			sig := `sig=:` + base64.StdEncoding.EncodeToString(make([]byte, ed25519.SignatureSize)) + `:`

			if _, _, _, _, _, err := parseSignatureHeaders(sigInput, sig); err == nil {
				t.Fatalf("expected duplicate %s to be rejected", param)
			}
		})
	}
}

func TestPKAV2RejectsDuplicateAidPkaDictionaryMembers(t *testing.T) {
	headers := http.Header{}
	headers.Set("Signature-Input", `aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created=1;expires=2;keyid="key";alg="ed25519";nonce="nonce";tag="aid-pka-v2", aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created=1;expires=2;keyid="key";alg="ed25519";nonce="nonce";tag="aid-pka-v2"`)
	headers.Set("Signature", `aid-pka=:`+base64.StdEncoding.EncodeToString(make([]byte, ed25519.SignatureSize))+`:`)

	if _, err := parseV2SignatureHeaders(headers); err == nil {
		t.Fatalf("expected duplicate aid-pka Signature-Input members to be rejected")
	}
}

func TestPKAV2RejectsDuplicateAidPkaSignatureDictionaryMembers(t *testing.T) {
	signature := base64.StdEncoding.EncodeToString(make([]byte, ed25519.SignatureSize))
	headers := http.Header{}
	headers.Set("Signature-Input", `aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created=1;expires=2;keyid="key";alg="ed25519";nonce="nonce";tag="aid-pka-v2"`)
	headers.Set("Signature", `aid-pka=:`+signature+`:, aid-pka=:`+signature+`:`)

	if _, err := parseV2SignatureHeaders(headers); err == nil {
		t.Fatalf("expected duplicate aid-pka Signature members to be rejected")
	}
}

func TestPKAV2RejectsNonExactAidPkaDictionaryMemberLabels(t *testing.T) {
	cases := map[string]struct {
		headerName string
		label      string
	}{
		"Signature-Input uppercase":  {headerName: "Signature-Input", label: "AID-PKA"},
		"Signature-Input mixed-case": {headerName: "Signature-Input", label: "Aid-Pka"},
		"Signature uppercase":        {headerName: "Signature", label: "AID-PKA"},
		"Signature mixed-case":       {headerName: "Signature", label: "Aid-Pka"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			headers := validPKAV2SignatureHeaders()
			value := strings.Replace(headers.Get(tc.headerName), "aid-pka=", tc.label+"=", 1)
			headers.Set(tc.headerName, value)

			if _, err := parseV2SignatureHeaders(headers); err == nil {
				t.Fatalf("expected non-exact %s member label %q to be rejected", tc.headerName, tc.label)
			}
		})
	}
}

func TestPKAV2RejectsAdditionalNonExactAidPkaDictionaryMemberLabels(t *testing.T) {
	cases := map[string]struct {
		headerName string
		label      string
	}{
		"Signature-Input uppercase":  {headerName: "Signature-Input", label: "AID-PKA"},
		"Signature-Input mixed-case": {headerName: "Signature-Input", label: "Aid-Pka"},
		"Signature uppercase":        {headerName: "Signature", label: "AID-PKA"},
		"Signature mixed-case":       {headerName: "Signature", label: "Aid-Pka"},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			headers := validPKAV2SignatureHeaders()
			confusedMember := strings.Replace(headers.Get(tc.headerName), "aid-pka=", tc.label+"=", 1)
			headers.Set(tc.headerName, headers.Get(tc.headerName)+", "+confusedMember)

			if _, err := parseV2SignatureHeaders(headers); err == nil {
				t.Fatalf("expected additional non-exact %s member label %q to be rejected", tc.headerName, tc.label)
			}
		})
	}
}

func TestPKAV2RejectsUnknownTopLevelSignatureInputParams(t *testing.T) {
	headers := validPKAV2SignatureHeaders()
	headers.Set("Signature-Input", headers.Get("Signature-Input")+`;foo="bar"`)

	if _, err := parseV2SignatureHeaders(headers); err == nil {
		t.Fatalf("expected unknown top-level Signature-Input parameter to be rejected")
	}
}

func TestPKAV2RejectsNonExactTopLevelSignatureInputParamNames(t *testing.T) {
	cases := map[string]struct {
		original    string
		replacement string
	}{
		"mixed-case created": {original: `;created=1`, replacement: `;Created=1`},
		"mixed-case keyid":   {original: `;keyid="key"`, replacement: `;KeyID="key"`},
		"uppercase alg":      {original: `;alg="ed25519"`, replacement: `;ALG="ed25519"`},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			headers := validPKAV2SignatureHeaders()
			sigInput := strings.Replace(headers.Get("Signature-Input"), tc.original, tc.replacement, 1)
			headers.Set("Signature-Input", sigInput)

			if _, err := parseV2SignatureHeaders(headers); err == nil {
				t.Fatalf("expected non-exact %s to be rejected", name)
			}
		})
	}
}

func TestPKAV2RejectsQuotedSignatureInputTimestamps(t *testing.T) {
	cases := map[string]struct {
		original    string
		replacement string
	}{
		"created": {original: `created=1`, replacement: `created="1"`},
		"expires": {original: `expires=2`, replacement: `expires="2"`},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			headers := validPKAV2SignatureHeaders()
			sigInput := strings.Replace(headers.Get("Signature-Input"), tc.original, tc.replacement, 1)
			headers.Set("Signature-Input", sigInput)

			if _, err := parseV2SignatureHeaders(headers); err == nil {
				t.Fatalf("expected quoted %s timestamp to be rejected", name)
			}
		})
	}
}

func TestPKAV2RejectsRepeatedPhysicalSignatureHeaders(t *testing.T) {
	cases := []string{"Signature-Input", "Signature"}
	for _, headerName := range cases {
		t.Run(headerName, func(t *testing.T) {
			headers := validPKAV2SignatureHeaders()
			headers.Add(headerName, headers.Get(headerName))

			if _, err := parseV2SignatureHeaders(headers); err == nil {
				t.Fatalf("expected repeated physical %s header values to be rejected", headerName)
			}
		})
	}
}

func TestPKAV2DomainBoundPassVector(t *testing.T) {
	vector := loadPKAV2Vector(t, "v2-db-rfc9421-domain-bound")
	withPKAV2VectorClockAndNonce(t, vector)

	oldClient := httpClient
	httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		if req.Header.Get("AID-Domain") != vector.Request.AidDomain {
			t.Fatalf("expected AID-Domain %q got %q", vector.Request.AidDomain, req.Header.Get("AID-Domain"))
		}
		if req.Header.Get("Accept-Signature") != vector.Request.AcceptSignature {
			t.Fatalf("unexpected Accept-Signature: %s", req.Header.Get("Accept-Signature"))
		}
		h := http.Header{}
		h.Set("Cache-Control", vector.Response.CacheControl)
		h.Set("Signature-Input", vector.Response.SignatureInput)
		h.Set("Signature", vector.Response.Signature)
		return &http.Response{StatusCode: vector.Response.Status, Header: h, Body: io.NopCloser(strings.NewReader(""))}, nil
	})}
	t.Cleanup(func() { httpClient = oldClient })

	result, err := performPKAHandshake(vector.Record.U, vector.Record.K, "", vector.Domain, time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.DomainBound {
		t.Fatalf("expected DomainBound=true")
	}
}

func TestPKAV2DomainMismatchRejected(t *testing.T) {
	// Cross-domain forgery: the response covers aid-domain and the client sent
	// AID-Domain=example.com, but the signature was computed over a base whose
	// aid-domain line is evil.example. The verifier rebuilds the base with
	// example.com, so Ed25519 verification fails and the response is rejected.
	vector := loadPKAV2Vector(t, "v2-db-domain-mismatch")
	if vector.Expect != "fail" {
		t.Fatalf("expected vector expect=fail, got %q", vector.Expect)
	}
	withPKAV2VectorClockAndNonce(t, vector)

	oldClient := httpClient
	httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		h := http.Header{}
		h.Set("Cache-Control", vector.Response.CacheControl)
		h.Set("Signature-Input", vector.Response.SignatureInput)
		h.Set("Signature", vector.Response.Signature)
		return &http.Response{StatusCode: vector.Response.Status, Header: h, Body: io.NopCloser(strings.NewReader(""))}, nil
	})}
	t.Cleanup(func() { httpClient = oldClient })

	_, err := performPKAHandshake(vector.Record.U, vector.Record.K, "", vector.Domain, time.Second)
	if err == nil {
		t.Fatalf("expected cross-domain forgery to be rejected at Ed25519 verification")
	}
	aidErr, ok := err.(*AidError)
	if !ok {
		t.Fatalf("expected AidError, got %T", err)
	}
	if aidErr.Symbol != "ERR_SECURITY" {
		t.Fatalf("expected ERR_SECURITY, got %s", aidErr.Symbol)
	}
}

func TestPKAV2RejectsInvalidCoveredSet(t *testing.T) {
	// aid-domain covered, but with an extra disallowed component (host) — validateV2CoveredSet
	// accepts only the base-4 or base-4 + aid-domain shapes and rejects anything else.
	headers := http.Header{}
	headers.Set("Signature-Input", `aid-pka=("@method";req "@target-uri";req "@authority";req "aid-domain";req "host";req "@status");created=1;expires=2;keyid="key";alg="ed25519";nonce="nonce";tag="aid-pka-v2"`)
	headers.Set("Signature", `aid-pka=:`+base64.StdEncoding.EncodeToString(make([]byte, ed25519.SignatureSize))+`:`)

	_, err := parseV2SignatureHeaders(headers)
	if err == nil {
		t.Fatalf("expected invalid covered set to be rejected")
	}
	aidErr, ok := err.(*AidError)
	if !ok {
		t.Fatalf("expected AidError, got %T", err)
	}
	if aidErr.Symbol != "ERR_SECURITY" {
		t.Fatalf("expected ERR_SECURITY, got %s", aidErr.Symbol)
	}
}

func TestPKAV2RejectsAidDomainCoverageWhenNoDomainSent(t *testing.T) {
	// Under the single-tag model, domain binding is signalled purely by aid-domain coverage.
	// A response that covers aid-domain is only meaningful when the client committed to a
	// domain via the AID-Domain header, so it must be rejected when no domain was sent.
	vector := loadPKAV2Vector(t, "v2-db-rfc9421-domain-bound")
	withPKAV2VectorClockAndNonce(t, vector)

	oldClient := httpClient
	httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		h := http.Header{}
		h.Set("Cache-Control", vector.Response.CacheControl)
		h.Set("Signature-Input", vector.Response.SignatureInput)
		h.Set("Signature", vector.Response.Signature)
		return &http.Response{StatusCode: vector.Response.Status, Header: h, Body: io.NopCloser(strings.NewReader(""))}, nil
	})}
	t.Cleanup(func() { httpClient = oldClient })

	// No domain passed to the handshake -> fail closed.
	_, err := performPKAHandshake(vector.Record.U, vector.Record.K, "", "", time.Second)
	if err == nil {
		t.Fatalf("expected aid-domain coverage without a sent domain to be rejected")
	}
	aidErr, ok := err.(*AidError)
	if !ok {
		t.Fatalf("expected AidError, got %T", err)
	}
	if aidErr.Symbol != "ERR_SECURITY" {
		t.Fatalf("expected ERR_SECURITY, got %s", aidErr.Symbol)
	}
	if aidErr.Msg != "Response covers aid-domain but no AID-Domain was sent" {
		t.Fatalf("unexpected message: %s", aidErr.Msg)
	}
}

func validPKAV2SignatureHeaders() http.Header {
	headers := http.Header{}
	headers.Set("Signature-Input", `aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created=1;expires=2;keyid="key";alg="ed25519";nonce="nonce";tag="aid-pka-v2"`)
	headers.Set("Signature", `aid-pka=:`+base64.StdEncoding.EncodeToString(make([]byte, ed25519.SignatureSize))+`:`)
	return headers
}
