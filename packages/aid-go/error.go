package aid

import "fmt"

// AidError represents a standard client error.
// Implements the error interface.

type AidError struct {
	Symbol string
	Code   int
	Msg    string
}

func (e *AidError) Error() string {
	return fmt.Sprintf("%s (%d): %s", e.Symbol, e.Code, e.Msg)
}

func newAidError(symbol string, msg string) *AidError {
	var code int
	switch symbol {
	case "ERR_NO_RECORD":
		code = ErrNoRecord
	case "ERR_INVALID_TXT":
		code = ErrInvalidTxt
	case "ERR_UNSUPPORTED_PROTO":
		code = ErrUnsupportedProto
	case "ERR_SECURITY":
		code = ErrSecurity
	case "ERR_DNS_LOOKUP_FAILED":
		code = ErrDnsLookupFailed
	case "ERR_FALLBACK_FAILED":
		code = ErrFallbackFailed
	default:
		code = -1 // Unknown error
	}
	return &AidError{Symbol: symbol, Code: code, Msg: msg}
}
