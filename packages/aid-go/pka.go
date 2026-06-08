package aid

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

var pkaRandRead = rand.Read

var pkaNowUnix = func() int64 {
	return time.Now().Unix()
}

// asciiToLower performs constant-time ASCII lowercasing.
func asciiToLower(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if 'A' <= c && c <= 'Z' {
			c += 'a' - 'A'
		}
		b.WriteByte(c)
	}
	return b.String()
}

// performPKAHandshake performs an RFC 9421 Ed25519 verification against the agent endpoint.
func performPKAHandshake(uri, pka, kid string, timeout time.Duration) error {
	if kid == "" {
		return performV2PKAHandshake(uri, pka, timeout)
	}
	return performV1PKAHandshake(uri, pka, kid, timeout)
}

func performV1PKAHandshake(uri, pka, kid string, timeout time.Duration) error {
	if kid == "" {
		return newAidError("ERR_SECURITY", "Missing kid for PKA")
	}
	u, err := url.Parse(uri)
	if err != nil || u.Host == "" {
		return newAidError("ERR_SECURITY", "Invalid URI for handshake")
	}
	// Prepare GET with challenge and date
	nonce, err := generatePKANonce()
	if err != nil {
		return err
	}
	challenge := base64.RawURLEncoding.EncodeToString(nonce)
	date := time.Now().UTC().Format("Mon, 02 Jan 2006 15:04:05 GMT")

	req, _ := http.NewRequest("GET", uri, nil)
	req.Header.Set("AID-Challenge", challenge)
	req.Header.Set("Date", date)
	client := *httpClient
	client.Timeout = timeout
	// Do not follow redirects for handshake per security policy
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := client.Do(req)
	if err != nil {
		return newAidError("ERR_SECURITY", err.Error())
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return newAidError("ERR_SECURITY", fmt.Sprintf("Handshake HTTP %d", resp.StatusCode))
	}

	sigInput := resp.Header.Get("Signature-Input")
	if sigInput == "" {
		sigInput = resp.Header.Get("signature-input")
	}
	sig := resp.Header.Get("Signature")
	if sig == "" {
		sig = resp.Header.Get("signature")
	}
	if sigInput == "" || sig == "" {
		return newAidError("ERR_SECURITY", "Missing signature headers")
	}

	covered, created, keyidRaw, alg, signature, perr := parseSignatureHeaders(sigInput, sig)
	if perr != nil {
		return perr
	}
	now := time.Now().Unix()
	if created < now-300 || created > now+300 {
		return newAidError("ERR_SECURITY", "Signature created timestamp outside acceptance window")
	}
	// strip optional quotes around keyid for comparison
	keyid := keyidRaw
	if len(keyid) >= 2 && keyid[0] == '"' && keyid[len(keyid)-1] == '"' {
		keyid = keyid[1 : len(keyid)-1]
	}
	if subtle.ConstantTimeCompare([]byte(keyid), []byte(kid)) != 1 {
		return newAidError("ERR_SECURITY", "Signature keyid mismatch")
	}
	if subtle.ConstantTimeCompare([]byte(asciiToLower(alg)), []byte("ed25519")) != 1 {
		return newAidError("ERR_SECURITY", "Unsupported signature algorithm")
	}

	dateHeader := resp.Header.Get("Date")
	// Validate Date header if present (±300s window)
	if dateHeader != "" {
		if t, e := http.ParseTime(dateHeader); e == nil {
			now := time.Now().UTC()
			diff := t.Sub(now)
			if diff < 0 {
				diff = -diff
			}
			if diff > 300*time.Second {
				return newAidError("ERR_SECURITY", "HTTP Date header outside acceptance window")
			}
		} else {
			return newAidError("ERR_SECURITY", "Invalid Date header")
		}
	}

	base, berr := buildSignatureBase(covered, created, keyidRaw, alg, "GET", uri, u.Host, chooseDate(date, dateHeader), challenge)
	if berr != nil {
		return berr
	}
	pub, derr := multibaseDecode(pka)
	if derr != nil {
		return derr
	}
	if len(pub) != ed25519.PublicKeySize {
		return newAidError("ERR_SECURITY", "Invalid PKA length")
	}
	if !ed25519.Verify(ed25519.PublicKey(pub), base, signature) {
		return newAidError("ERR_SECURITY", "PKA signature verification failed")
	}
	return nil
}

func performV2PKAHandshake(uri, pka string, timeout time.Duration) error {
	pub, expectedKeyID, err := deriveAid2KeyMaterial(pka)
	if err != nil {
		return err
	}
	requestURI, err := normalizeRequestURI(uri)
	if err != nil {
		return err
	}
	authority, err := requestAuthority(requestURI)
	if err != nil {
		return err
	}
	nonceBytes, err := generatePKANonce()
	if err != nil {
		return err
	}
	nonce := base64.RawURLEncoding.EncodeToString(nonceBytes)

	req, err := http.NewRequest("GET", requestURI, nil)
	if err != nil {
		return newAidError("ERR_SECURITY", err.Error())
	}
	req.Header.Set("Accept-Signature", buildAcceptSignatureV2(expectedKeyID, nonce))
	req.Header.Set("Cache-Control", "no-store")

	client := *httpClient
	client.Timeout = timeout
	client.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	}
	resp, err := client.Do(req)
	if err != nil {
		return newAidError("ERR_SECURITY", err.Error())
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		return newAidError("ERR_SECURITY", "PKA redirects are not allowed")
	}
	if !hasNoStoreDirective(resp.Header.Get("Cache-Control")) {
		return newAidError("ERR_SECURITY", "PKA response must include Cache-Control: no-store")
	}

	parsed, err := parseV2SignatureHeaders(resp.Header)
	if err != nil {
		return err
	}
	now := pkaNowUnix()
	if parsed.expires <= parsed.created || parsed.expires-parsed.created > 300 {
		return newAidError("ERR_SECURITY", "Invalid signature freshness window")
	}
	const skewSeconds = 30
	if parsed.created-now > skewSeconds || now-parsed.expires > skewSeconds {
		return newAidError("ERR_SECURITY", "Signature timestamp outside acceptance window")
	}
	if !timingSafeEqualString(parsed.keyid, expectedKeyID) {
		return newAidError("ERR_SECURITY", "Signature keyid mismatch")
	}
	if !timingSafeEqualString(asciiToLower(parsed.alg), "ed25519") {
		return newAidError("ERR_SECURITY", "Unsupported signature algorithm")
	}
	if !timingSafeEqualString(parsed.nonce, nonce) {
		return newAidError("ERR_SECURITY", "Signature nonce mismatch")
	}
	if !timingSafeEqualString(parsed.tag, "aid-pka-v2") {
		return newAidError("ERR_SECURITY", "Invalid signature tag")
	}

	base, err := buildV2SignatureBase(parsed.covered, parsed.signatureParamsRaw, v2SignatureContext{
		method:    "GET",
		targetURI: requestURI,
		authority: authority,
		status:    resp.StatusCode,
	})
	if err != nil {
		return err
	}
	if !ed25519.Verify(pub, base, parsed.signature) {
		return newAidError("ERR_SECURITY", "PKA signature verification failed")
	}
	return nil
}

func generatePKANonce() ([]byte, error) {
	nonce := make([]byte, 32)
	n, err := pkaRandRead(nonce)
	if err != nil {
		return nil, newAidError("ERR_SECURITY", err.Error())
	}
	if n != len(nonce) {
		return nil, newAidError("ERR_SECURITY", "Incomplete random nonce")
	}
	return nonce, nil
}

func deriveAid2KeyMaterial(pka string) (ed25519.PublicKey, string, error) {
	pub, err := decodeUnpaddedBase64URL(pka)
	if err != nil {
		return nil, "", newAidError("ERR_SECURITY", "Invalid aid2 PKA encoding")
	}
	if len(pub) != aid2PkaPublicKeySize {
		return nil, "", newAidError("ERR_SECURITY", "Invalid PKA length")
	}
	thumbprintInput := fmt.Sprintf(`{"crv":"Ed25519","kty":"OKP","x":"%s"}`, pka)
	digest := sha256.Sum256([]byte(thumbprintInput))
	keyID := base64.RawURLEncoding.EncodeToString(digest[:])
	return ed25519.PublicKey(pub), keyID, nil
}

func normalizeRequestURI(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return "", newAidError("ERR_SECURITY", "Invalid URI for handshake")
	}
	authority, err := requestAuthority(raw)
	if err != nil {
		return "", err
	}
	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = authority
	u.Fragment = ""
	return u.String(), nil
}

func requestAuthority(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return "", newAidError("ERR_SECURITY", "Invalid URI for handshake")
	}
	hostname := strings.ToLower(u.Hostname())
	if strings.Contains(hostname, ":") && !strings.HasPrefix(hostname, "[") {
		hostname = "[" + hostname + "]"
	}
	port := u.Port()
	if port == "" ||
		(u.Scheme == "https" && port == "443") ||
		(u.Scheme == "http" && port == "80") {
		return hostname, nil
	}
	return hostname + ":" + port, nil
}

func buildAcceptSignatureV2(keyID, nonce string) string {
	return fmt.Sprintf(`aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created;expires;keyid="%s";alg="ed25519";nonce="%s";tag="aid-pka-v2"`, keyID, nonce)
}

func hasNoStoreDirective(cacheControl string) bool {
	if cacheControl == "" {
		return false
	}
	for _, part := range strings.Split(cacheControl, ",") {
		directive := strings.ToLower(strings.TrimSpace(strings.SplitN(part, ";", 2)[0]))
		if directive == "no-store" {
			return true
		}
	}
	return false
}

func timingSafeEqualString(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

type v2CoveredItem struct {
	raw  string
	name string
	req  bool
}

type v2SignatureHeaders struct {
	covered            []v2CoveredItem
	signatureParamsRaw string
	created            int64
	expires            int64
	keyid              string
	alg                string
	nonce              string
	tag                string
	signature          []byte
}

type v2SignatureContext struct {
	method    string
	targetURI string
	authority string
	status    int
}

func parseV2SignatureHeaders(headers http.Header) (v2SignatureHeaders, error) {
	sigInput, err := singleHeaderValue(headers, "Signature-Input")
	if err != nil {
		return v2SignatureHeaders{}, err
	}
	sig, err := singleHeaderValue(headers, "Signature")
	if err != nil {
		return v2SignatureHeaders{}, err
	}
	if sigInput == "" || sig == "" {
		return v2SignatureHeaders{}, newAidError("ERR_SECURITY", "Missing signature headers")
	}

	signatureParamsRaw, err := extractDictionaryMember(sigInput, "aid-pka")
	if err != nil {
		return v2SignatureHeaders{}, err
	}
	if !strings.HasPrefix(signatureParamsRaw, "(") {
		return v2SignatureHeaders{}, newAidError("ERR_SECURITY", "Invalid Signature-Input")
	}
	closeIndex := strings.Index(signatureParamsRaw, ")")
	if closeIndex < 0 {
		return v2SignatureHeaders{}, newAidError("ERR_SECURITY", "Invalid Signature-Input")
	}
	coveredRaw := strings.TrimSpace(signatureParamsRaw[1:closeIndex])
	paramsRaw := signatureParamsRaw[closeIndex+1:]
	rawItems := splitInnerListItems(coveredRaw)
	covered := make([]v2CoveredItem, 0, len(rawItems))
	for _, raw := range rawItems {
		item, err := parseV2CoveredItem(raw)
		if err != nil {
			return v2SignatureHeaders{}, err
		}
		covered = append(covered, item)
	}
	if err := validateV2CoveredSet(covered); err != nil {
		return v2SignatureHeaders{}, err
	}

	params, err := parseSignatureParams(paramsRaw)
	if err != nil {
		return v2SignatureHeaders{}, err
	}
	createdRaw, hasCreated := params["created"]
	expiresRaw, hasExpires := params["expires"]
	keyID, hasKeyID := params["keyid"]
	alg, hasAlg := params["alg"]
	nonce, hasNonce := params["nonce"]
	tag, hasTag := params["tag"]
	if !hasCreated || !hasExpires || !hasKeyID || !hasAlg || !hasNonce || !hasTag {
		return v2SignatureHeaders{}, newAidError("ERR_SECURITY", "Invalid Signature-Input")
	}
	created, err := strconv.ParseInt(createdRaw, 10, 64)
	if err != nil {
		return v2SignatureHeaders{}, newAidError("ERR_SECURITY", "Invalid Signature-Input timestamp")
	}
	expires, err := strconv.ParseInt(expiresRaw, 10, 64)
	if err != nil {
		return v2SignatureHeaders{}, newAidError("ERR_SECURITY", "Invalid Signature-Input timestamp")
	}

	signatureRaw, err := extractDictionaryMember(sig, "aid-pka")
	if err != nil {
		return v2SignatureHeaders{}, err
	}
	signatureRaw = strings.TrimSpace(signatureRaw)
	if !strings.HasPrefix(signatureRaw, ":") || !strings.HasSuffix(signatureRaw, ":") || len(signatureRaw) < 3 {
		return v2SignatureHeaders{}, newAidError("ERR_SECURITY", "Invalid Signature header")
	}
	signature, err := base64.StdEncoding.DecodeString(strings.TrimSpace(signatureRaw[1 : len(signatureRaw)-1]))
	if err != nil {
		return v2SignatureHeaders{}, newAidError("ERR_SECURITY", "Invalid Signature header")
	}

	return v2SignatureHeaders{
		covered:            covered,
		signatureParamsRaw: signatureParamsRaw,
		created:            created,
		expires:            expires,
		keyid:              keyID,
		alg:                alg,
		nonce:              nonce,
		tag:                tag,
		signature:          signature,
	}, nil
}

func singleHeaderValue(headers http.Header, name string) (string, error) {
	lowerName := asciiToLower(name)
	values := []string{}
	for headerName, headerValues := range headers {
		if asciiToLower(headerName) == lowerName {
			values = append(values, headerValues...)
		}
	}
	if len(values) > 1 {
		return "", newAidError("ERR_SECURITY", "Multiple "+name+" header values")
	}
	if len(values) == 0 {
		return "", nil
	}
	return values[0], nil
}

func splitDictionaryMembers(input string) []string {
	var parts []string
	start := 0
	inString := false
	escaped := false
	depth := 0
	for i := 0; i < len(input); i++ {
		char := input[i]
		if inString {
			if escaped {
				escaped = false
			} else if char == '\\' {
				escaped = true
			} else if char == '"' {
				inString = false
			}
			continue
		}
		if char == '"' {
			inString = true
			continue
		}
		if char == '(' {
			depth++
		}
		if char == ')' {
			depth--
		}
		if char == ',' && depth == 0 {
			if part := strings.TrimSpace(input[start:i]); part != "" {
				parts = append(parts, part)
			}
			start = i + 1
		}
	}
	if part := strings.TrimSpace(input[start:]); part != "" {
		parts = append(parts, part)
	}
	return parts
}

func extractDictionaryMember(input, label string) (string, error) {
	lowerLabel := asciiToLower(label)
	var result string
	found := false
	for _, part := range splitDictionaryMembers(input) {
		eq := strings.Index(part, "=")
		if eq <= 0 {
			continue
		}
		memberLabel := strings.TrimSpace(part[:eq])
		if asciiToLower(memberLabel) == lowerLabel && memberLabel != label {
			return "", newAidError("ERR_SECURITY", "Invalid "+label+" signature member")
		}
		if memberLabel == label {
			if found {
				return "", newAidError("ERR_SECURITY", "Duplicate "+label+" signature member")
			}
			result = strings.TrimSpace(part[eq+1:])
			found = true
		}
	}
	if found {
		return result, nil
	}
	return "", newAidError("ERR_SECURITY", "Missing "+label+" signature member")
}

func splitInnerListItems(input string) []string {
	var items []string
	start := 0
	inString := false
	escaped := false
	for i := 0; i < len(input); i++ {
		char := input[i]
		if inString {
			if escaped {
				escaped = false
			} else if char == '\\' {
				escaped = true
			} else if char == '"' {
				inString = false
			}
			continue
		}
		if char == '"' {
			inString = true
			continue
		}
		if char == ' ' || char == '\t' || char == '\n' || char == '\r' {
			if item := strings.TrimSpace(input[start:i]); item != "" {
				items = append(items, item)
			}
			start = i + 1
		}
	}
	if item := strings.TrimSpace(input[start:]); item != "" {
		items = append(items, item)
	}
	return items
}

func parseV2CoveredItem(raw string) (v2CoveredItem, error) {
	if !strings.HasPrefix(raw, "\"") {
		return v2CoveredItem{}, newAidError("ERR_SECURITY", "Invalid Signature-Input covered item")
	}
	end := strings.Index(raw[1:], "\"")
	if end < 0 {
		return v2CoveredItem{}, newAidError("ERR_SECURITY", "Invalid Signature-Input covered item")
	}
	end++
	name := raw[1:end]
	paramsRaw := raw[end+1:]
	req := false
	if paramsRaw != "" {
		if !strings.HasPrefix(paramsRaw, ";") {
			return v2CoveredItem{}, newAidError("ERR_SECURITY", "Invalid Signature-Input covered item parameter")
		}
		for _, param := range strings.Split(paramsRaw[1:], ";") {
			param = strings.TrimSpace(param)
			if param == "" {
				return v2CoveredItem{}, newAidError("ERR_SECURITY", "Invalid Signature-Input covered item parameter")
			}
			if param != "req" {
				return v2CoveredItem{}, newAidError("ERR_SECURITY", "Unsupported Signature-Input covered item parameter")
			}
			if req {
				return v2CoveredItem{}, newAidError("ERR_SECURITY", "Duplicate Signature-Input covered item parameter")
			}
			req = true
		}
	}
	switch name {
	case "@method", "@target-uri", "@authority", "@status":
	default:
		return v2CoveredItem{}, newAidError("ERR_SECURITY", "Unsupported covered field: "+name)
	}
	return v2CoveredItem{raw: raw, name: name, req: req}, nil
}

func validateV2CoveredSet(covered []v2CoveredItem) error {
	if len(covered) != 4 {
		return newAidError("ERR_SECURITY", "Signature-Input must cover required fields")
	}
	expected := map[string]bool{
		"@method":     true,
		"@target-uri": true,
		"@authority":  true,
		"@status":     false,
	}
	seen := map[string]bool{}
	for _, item := range covered {
		req, ok := expected[item.name]
		if !ok || seen[item.name] || req != item.req {
			return newAidError("ERR_SECURITY", "Signature-Input must cover required fields")
		}
		seen[item.name] = true
	}
	if len(seen) != len(expected) {
		return newAidError("ERR_SECURITY", "Signature-Input must cover required fields")
	}
	return nil
}

func unquoteSfString(value string) string {
	if !strings.HasPrefix(value, "\"") || !strings.HasSuffix(value, "\"") {
		return value
	}
	var out strings.Builder
	for i := 1; i < len(value)-1; i++ {
		char := value[i]
		if char == '\\' && i+1 < len(value)-1 {
			i++
			out.WriteByte(value[i])
			continue
		}
		out.WriteByte(char)
	}
	return out.String()
}

func parseSignatureParams(raw string) (map[string]string, error) {
	params := map[string]string{}
	i := 0
	for i < len(raw) {
		for i < len(raw) && isSpace(raw[i]) {
			i++
		}
		if i >= len(raw) {
			break
		}
		if raw[i] != ';' {
			return nil, newAidError("ERR_SECURITY", "Invalid Signature-Input parameters")
		}
		i++
		for i < len(raw) && isSpace(raw[i]) {
			i++
		}
		nameStart := i
		for i < len(raw) && isParamNameChar(raw[i]) {
			i++
		}
		name := raw[nameStart:i]
		if name == "" {
			return nil, newAidError("ERR_SECURITY", "Invalid Signature-Input parameter")
		}
		if !isCriticalSignatureParam(name) {
			return nil, newAidError("ERR_SECURITY", "Unsupported Signature-Input parameter")
		}
		if _, exists := params[name]; exists {
			return nil, newAidError("ERR_SECURITY", "Duplicate Signature-Input parameter")
		}
		for i < len(raw) && isSpace(raw[i]) {
			i++
		}
		if i >= len(raw) || raw[i] != '=' {
			params[name] = ""
			continue
		}
		i++
		for i < len(raw) && isSpace(raw[i]) {
			i++
		}
		valueStart := i
		if i < len(raw) && raw[i] == '"' {
			i++
			escaped := false
			for i < len(raw) {
				char := raw[i]
				if escaped {
					escaped = false
				} else if char == '\\' {
					escaped = true
				} else if char == '"' {
					i++
					break
				}
				i++
			}
		} else {
			for i < len(raw) && raw[i] != ';' {
				i++
			}
		}
		rawValue := strings.TrimSpace(raw[valueStart:i])
		if (name == "created" || name == "expires") && !isBareIntegerToken(rawValue) {
			return nil, newAidError("ERR_SECURITY", "Invalid Signature-Input timestamp")
		}
		params[name] = unquoteSfString(rawValue)
	}
	return params, nil
}

func isBareIntegerToken(value string) bool {
	if value == "" {
		return false
	}
	start := 0
	if value[0] == '-' {
		if len(value) == 1 {
			return false
		}
		start = 1
	}
	for i := start; i < len(value); i++ {
		if value[i] < '0' || value[i] > '9' {
			return false
		}
	}
	return true
}

func isCriticalSignatureParam(name string) bool {
	switch name {
	case "nonce", "keyid", "alg", "created", "expires", "tag":
		return true
	default:
		return false
	}
}

func isSpace(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r'
}

func isParamNameChar(c byte) bool {
	return ('A' <= c && c <= 'Z') ||
		('a' <= c && c <= 'z') ||
		('0' <= c && c <= '9') ||
		c == '_' ||
		c == '*' ||
		c == '.' ||
		c == '-'
}

func buildV2SignatureBase(covered []v2CoveredItem, signatureParamsRaw string, ctx v2SignatureContext) ([]byte, error) {
	lines := make([]string, 0, len(covered)+1)
	for _, item := range covered {
		switch item.name {
		case "@method":
			lines = append(lines, "\"@method\";req: "+ctx.method)
		case "@target-uri":
			lines = append(lines, "\"@target-uri\";req: "+ctx.targetURI)
		case "@authority":
			lines = append(lines, "\"@authority\";req: "+ctx.authority)
		case "@status":
			lines = append(lines, "\"@status\": "+strconv.Itoa(ctx.status))
		default:
			return nil, newAidError("ERR_SECURITY", "Unsupported covered field: "+item.name)
		}
	}
	lines = append(lines, "\"@signature-params\": "+signatureParamsRaw)
	return []byte(strings.Join(lines, "\n")), nil
}

func parseSignatureHeaders(sigInput, sig string) (covered []string, created int64, keyidRaw, alg string, signature []byte, err error) {
	// sig=("a" "b");created=...;keyid=...;alg="ed25519"
	idx := strings.Index(sigInput, "sig=(")
	if idx < 0 {
		return nil, 0, "", "", nil, newAidError("ERR_SECURITY", "Invalid Signature-Input")
	}
	rest := sigInput[idx+5:]
	close := strings.Index(rest, ")")
	if close < 0 {
		return nil, 0, "", "", nil, newAidError("ERR_SECURITY", "Invalid Signature-Input")
	}
	inside := rest[:close]
	// Extract quoted tokens
	for len(inside) > 0 {
		start := strings.Index(inside, "\"")
		if start < 0 {
			break
		}
		inside = inside[start+1:]
		end := strings.Index(inside, "\"")
		if end < 0 {
			break
		}
		covered = append(covered, inside[:end])
		inside = inside[end+1:]
	}
	if len(covered) == 0 {
		return nil, 0, "", "", nil, newAidError("ERR_SECURITY", "Invalid Signature-Input")
	}
	// Enforce exact required set in constant time
	required := []string{"aid-challenge", "@method", "@target-uri", "host", "date"}
	if len(covered) != len(required) {
		return nil, 0, "", "", nil, newAidError("ERR_SECURITY", "Signature-Input must cover required fields")
	}
	coveredLower := make([]string, len(covered))
	for i, c := range covered {
		coveredLower[i] = asciiToLower(c)
	}
	sort.Strings(coveredLower)
	sort.Strings(required)

	areEqual := 1
	for i := 0; i < len(required); i++ {
		if subtle.ConstantTimeCompare([]byte(coveredLower[i]), []byte(required[i])) != 1 {
			areEqual = 0
			// Do not break early
		}
	}
	if areEqual != 1 {
		return nil, 0, "", "", nil, newAidError("ERR_SECURITY", "Signature-Input must cover required fields")
	}

	// Params
	seenCriticalParams := map[string]bool{}
	for _, part := range strings.Split(sigInput, ";") {
		p := strings.TrimSpace(part)
		name, _, hasValue := strings.Cut(p, "=")
		name = asciiToLower(strings.TrimSpace(name))
		if isCriticalSignatureParam(name) {
			if seenCriticalParams[name] {
				return nil, 0, "", "", nil, newAidError("ERR_SECURITY", "Duplicate Signature-Input parameter")
			}
			seenCriticalParams[name] = true
		}
		if hasValue && name == "created" {
			var c int64
			_, e := fmt.Sscanf(p[len("created="):], "%d", &c)
			if e == nil {
				created = c
			}
		} else if hasValue && name == "keyid" {
			keyidRaw = strings.TrimSpace(p[len("keyid="):])
		} else if hasValue && name == "alg" {
			alg = strings.Trim(strings.TrimSpace(p[len("alg="):]), "\"")
		}
	}
	if created == 0 || keyidRaw == "" || alg == "" {
		return nil, 0, "", "", nil, newAidError("ERR_SECURITY", "Invalid Signature-Input")
	}

	// Signature header: sig=:base64:
	s := sig
	i := strings.Index(strings.ToLower(s), "sig=")
	if i < 0 {
		return nil, 0, "", "", nil, newAidError("ERR_SECURITY", "Invalid Signature header")
	}
	s = s[i+4:]
	if !strings.HasPrefix(s, ":") {
		return nil, 0, "", "", nil, newAidError("ERR_SECURITY", "Invalid Signature header")
	}
	s = s[1:]
	end := strings.Index(s, ":")
	if end < 0 {
		return nil, 0, "", "", nil, newAidError("ERR_SECURITY", "Invalid Signature header")
	}
	val := s[:end]
	dec, e := base64.StdEncoding.DecodeString(val)
	if e != nil {
		return nil, 0, "", "", nil, newAidError("ERR_SECURITY", "Invalid Signature header")
	}
	return covered, created, keyidRaw, alg, dec, nil
}

func chooseDate(requestDate, responseDate string) string {
	if responseDate != "" {
		return responseDate
	}
	return requestDate
}

func buildSignatureBase(covered []string, created int64, keyid, alg, method, targetURI, host, date, challenge string) ([]byte, error) {
	lines := make([]string, 0, len(covered)+1)
	for _, item := range covered {
		lower := asciiToLower(item)
		appended := false
		if subtle.ConstantTimeCompare([]byte(lower), []byte("aid-challenge")) == 1 {
			lines = append(lines, "\"AID-Challenge\": "+challenge)
			appended = true
		}
		if subtle.ConstantTimeCompare([]byte(lower), []byte("@method")) == 1 {
			lines = append(lines, "\"@method\": "+method)
			appended = true
		}
		if subtle.ConstantTimeCompare([]byte(lower), []byte("@target-uri")) == 1 {
			lines = append(lines, "\"@target-uri\": "+targetURI)
			appended = true
		}
		if subtle.ConstantTimeCompare([]byte(lower), []byte("host")) == 1 {
			lines = append(lines, "\"host\": "+host)
			appended = true
		}
		if subtle.ConstantTimeCompare([]byte(lower), []byte("date")) == 1 {
			lines = append(lines, "\"date\": "+date)
			appended = true
		}
		if !appended {
			return nil, newAidError("ERR_SECURITY", "Unsupported covered field: "+item)
		}
	}
	quoted := make([]string, len(covered))
	for i, c := range covered {
		quoted[i] = "\"" + c + "\""
	}
	params := fmt.Sprintf("(%s);created=%d;keyid=%s;alg=\"%s\"", strings.Join(quoted, " "), created, keyid, asciiToLower(alg))
	lines = append(lines, "\"@signature-params\": "+params)
	return []byte(strings.Join(lines, "\n")), nil
}

func multibaseDecode(s string) ([]byte, error) {
	if s == "" {
		return nil, newAidError("ERR_SECURITY", "Empty PKA")
	}
	if s[0] != 'z' {
		return nil, newAidError("ERR_SECURITY", "Unsupported multibase prefix")
	}
	out, err := base58Decode(s[1:])
	if err != nil {
		return nil, err
	}
	return out, nil
}

func base58Decode(s string) ([]byte, error) {
	const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
	if s == "" {
		return []byte{}, nil
	}
	zeros := 0
	for zeros < len(s) && s[zeros] == '1' {
		zeros++
	}
	size := (len(s)-zeros)*733/1000 + 1 // log(58)/log(256) ≈ 0.733
	b := make([]byte, size)
	for i := zeros; i < len(s); i++ {
		ch := s[i]
		idx := strings.IndexByte(alphabet, ch)
		if idx < 0 {
			return nil, newAidError("ERR_SECURITY", "Invalid base58 character")
		}
		carry := idx
		for j := size - 1; j >= 0; j-- {
			carry += 58 * int(b[j])
			b[j] = byte(carry & 0xff)
			carry >>= 8
		}
	}
	// strip leading zeros
	it := 0
	for it < len(b) && b[it] == 0 {
		it++
	}
	out := make([]byte, zeros+len(b)-it)
	for i := 0; i < zeros; i++ {
		out[i] = 0
	}
	copy(out[zeros:], b[it:])
	return out, nil
}
