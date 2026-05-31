package aid

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

type vector struct {
	ID     string `json:"id"`
	Desc   string `json:"desc"`
	Record struct {
		V string `json:"v"`
		U string `json:"u"`
		P string `json:"p"`
		I string `json:"i"`
	} `json:"record"`
	Key struct {
		Public  string `json:"public"`
		SeedB64 string `json:"seed_b64"`
	} `json:"key"`
	Covered       []string `json:"covered"`
	Created       int64    `json:"created"`
	HTTPDate      string   `json:"httpDate"`
	OverrideAlg   string   `json:"overrideAlg"`
	OverrideKeyId string   `json:"overrideKeyId"`
	Expect        string   `json:"expect"`
}

type vectorsFile struct {
	Version int      `json:"version"`
	Vectors []vector `json:"vectors"`
}

// simple base58 encode for tests
func b58encode(data []byte) string {
	const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
	// count leading zeros
	zeros := 0
	for zeros < len(data) && data[zeros] == 0 {
		zeros++
	}
	// approximate size
	size := len(data)*138/100 + 1
	b := make([]byte, size)
	for _, v := range data {
		carry := int(v)
		for j := size - 1; j >= 0; j-- {
			carry += 256 * int(b[j])
			b[j] = byte(carry % 58)
			carry /= 58
		}
	}
	// skip leading zeros in b
	it := 0
	for it < size && b[it] == 0 {
		it++
	}
	out := strings.Repeat("1", zeros)
	for ; it < size; it++ {
		out += string(alphabet[b[it]])
	}
	return out
}

// mockRoundTripper responds to well-known and handshake requests based on a vector
type mockRoundTripper struct {
	V   vector
	Pka string
}

func (m *mockRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	if strings.HasSuffix(req.URL.Path, "/.well-known/agent") {
		// Return JSON with record and computed PKA
		body := []byte(`{"v":"` + m.V.Record.V + `","u":"` + m.V.Record.U + `","p":"` + m.V.Record.P + `","k":"` + m.Pka + `","i":"` + m.V.Record.I + `"}`)
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(string(body)))}, nil
	}
	// Handshake response
	challenge := req.Header.Get("AID-Challenge")
	reqDate := req.Header.Get("Date")
	// For passing cases, make created within window using current time, otherwise use vector's Created/HTTPDate
	created := m.V.Created
	date := reqDate
	if m.V.Expect == "pass" {
		created = time.Now().Unix()
		date = reqDate
	} else if m.V.HTTPDate != "" {
		date = m.V.HTTPDate
	}
	order := m.V.Covered
	keyid := m.V.OverrideKeyId
	if keyid == "" {
		keyid = m.V.Record.I
	}
	alg := m.V.OverrideAlg
	if alg == "" {
		alg = "ed25519"
	}

	// Build base per spec formatting
	var lines []string
	for _, item := range order {
		switch strings.ToLower(item) {
		case "aid-challenge":
			lines = append(lines, "\"AID-Challenge\": "+challenge)
		case "@method":
			lines = append(lines, "\"@method\": GET")
		case "@target-uri":
			lines = append(lines, "\"@target-uri\": "+req.URL.String())
		case "host":
			lines = append(lines, "\"host\": "+req.URL.Host)
		case "date":
			lines = append(lines, "\"date\": "+date)
		}
	}
	// Params (use keyid raw as provided)
	quoted := make([]string, 0, len(order))
	for _, c := range order {
		quoted = append(quoted, "\""+c+"\"")
	}
	params := "(" + strings.Join(quoted, " ") + ");created=" + strconvI(created) + ";keyid=" + keyid + ";alg=\"" + alg + "\""
	lines = append(lines, "\"@signature-params\": "+params)
	base := []byte(strings.Join(lines, "\n"))

	// Sign base
	seed, _ := base64.StdEncoding.DecodeString(m.V.Key.SeedB64)
	sk := ed25519.NewKeyFromSeed(seed)
	sig := ed25519.Sign(sk, base)
	sigB64 := base64.StdEncoding.EncodeToString(sig)

	h := make(http.Header)
	h.Set("Signature-Input", "sig=("+strings.Join(quoted, " ")+");created="+strconvI(created)+";keyid="+keyid+";alg=\""+alg+"\"")
	h.Set("Signature", "sig=:"+sigB64+":")
	h.Set("Date", date)
	return &http.Response{StatusCode: 200, Header: h, Body: io.NopCloser(strings.NewReader(""))}, nil
}

func strconvI(i int64) string { return strconv.FormatInt(i, 10) }

func TestPKAVectors(t *testing.T) {
	// Load vectors
	// Relative path from this package to protocol/pka_vectors.json
	path := filepath.Join("..", "..", "protocol", "pka_vectors.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Skip("vectors not available: ", err)
	}
	var vf vectorsFile
	if err := json.Unmarshal(raw, &vf); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}

	// Override DNS to force well-known
	oldLookup := lookupTXT
	defer func() { lookupTXT = oldLookup }()
	lookupTXT = func(ctx context.Context, name string) ([]string, error) {
		return nil, &net.DNSError{Err: "no such host", Name: name}
	}

	for _, v := range vf.Vectors {
		if v.Record.V != SpecVersionV1 {
			continue
		}
		// Compute PKA from seed
		seed, _ := base64.StdEncoding.DecodeString(v.Key.SeedB64)
		sk := ed25519.NewKeyFromSeed(seed)
		pub := sk.Public().(ed25519.PublicKey)
		pka := "z" + b58encode(pub)

		// Install mock HTTP client
		oldClient := httpClient
		httpClient = &http.Client{Transport: &mockRoundTripper{V: v, Pka: pka}}
		// Execute discovery (domain unused as we mock DNS and HTTP)
		_, _, err := Discover("example.com", 2*time.Second)
		// Restore client for next iteration
		httpClient = oldClient

		if v.Expect == "pass" && err != nil {
			t.Fatalf("%s expected pass, got error: %v", v.ID, err)
		}
		if v.Expect == "fail" && err == nil {
			t.Fatalf("%s expected fail, got success", v.ID)
		}
	}
}
