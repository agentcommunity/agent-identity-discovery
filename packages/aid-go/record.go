package aid

// AidRecord holds the parsed key-value pairs from a TXT record.
type AidRecord struct {
	V     string `json:"v"`
	URI   string `json:"uri"`
	Proto string `json:"proto"`
	Auth  string `json:"auth,omitempty"`
	Desc  string `json:"desc,omitempty"`
	Docs  string `json:"docs,omitempty"`
	Dep   string `json:"dep,omitempty"`
	Pka   string `json:"pka,omitempty"`
	Kid   string `json:"kid,omitempty"`
}

// AidRecordV1 is the version-specific aid1 contract. It preserves legacy DNS kid/i.
type AidRecordV1 struct {
	V     string `json:"v"`
	URI   string `json:"uri"`
	Proto string `json:"proto"`
	Auth  string `json:"auth,omitempty"`
	Desc  string `json:"desc,omitempty"`
	Docs  string `json:"docs,omitempty"`
	Dep   string `json:"dep,omitempty"`
	Pka   string `json:"pka,omitempty"`
	Kid   string `json:"kid,omitempty"`
}

// AidRecordV2 is the version-specific aid2 contract. DNS kid/i is not part of v2.
type AidRecordV2 struct {
	V     string `json:"v"`
	URI   string `json:"uri"`
	Proto string `json:"proto"`
	Auth  string `json:"auth,omitempty"`
	Desc  string `json:"desc,omitempty"`
	Docs  string `json:"docs,omitempty"`
	Dep   string `json:"dep,omitempty"`
	Pka   string `json:"pka,omitempty"`
}

// AsV1 projects the compatibility AidRecord into the aid1-specific contract.
func (r AidRecord) AsV1() (AidRecordV1, bool) {
	if r.V != SpecVersionV1 {
		return AidRecordV1{}, false
	}
	return AidRecordV1{
		V:     r.V,
		URI:   r.URI,
		Proto: r.Proto,
		Auth:  r.Auth,
		Desc:  r.Desc,
		Docs:  r.Docs,
		Dep:   r.Dep,
		Pka:   r.Pka,
		Kid:   r.Kid,
	}, true
}

// AsV2 projects the compatibility AidRecord into the aid2-specific contract.
// It refuses records carrying legacy Kid so v2 never conceptually includes DNS kid/i.
func (r AidRecord) AsV2() (AidRecordV2, bool) {
	if r.V != SpecVersionV2 || r.Kid != "" {
		return AidRecordV2{}, false
	}
	return AidRecordV2{
		V:     r.V,
		URI:   r.URI,
		Proto: r.Proto,
		Auth:  r.Auth,
		Desc:  r.Desc,
		Docs:  r.Docs,
		Dep:   r.Dep,
		Pka:   r.Pka,
	}, true
}
