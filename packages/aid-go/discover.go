package aid

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"

	"golang.org/x/net/idna"
)

// lookupTXT is an indirection to make unit testing easier.
var lookupTXT = net.DefaultResolver.LookupTXT

// Discover queries DNS for the _agent TXT record and parses it.
// Returns record and a TTL (0 when unknown).
// DiscoveryOptions provides optional behavior controls for discovery.
type DiscoveryOptions struct {
	// Protocol: when set, try _agent._<proto>.<domain> then _agent.<proto>.<domain> before base.
	Protocol string
	// WellKnownFallback: if true, attempt HTTPS .well-known fallback on ERR_NO_RECORD or ERR_DNS_LOOKUP_FAILED.
	WellKnownFallback bool
	// WellKnownTimeout: timeout for the .well-known HTTP fetch.
	WellKnownTimeout time.Duration
}

// Discover retains the original signature for backward compatibility.
// It performs DNS-first discovery and falls back to HTTPS .well-known.
func Discover(domain string, timeout time.Duration) (AidRecord, uint32, error) {
	opts := DiscoveryOptions{WellKnownFallback: true, WellKnownTimeout: 2 * time.Second}
	return DiscoverWithOptions(domain, timeout, opts)
}

// DiscoverWithOptions performs discovery with protocol-specific DNS flow and well-known controls.
func DiscoverWithOptions(domain string, timeout time.Duration, opts DiscoveryOptions) (AidRecord, uint32, error) {
	// IDN → A-label
	alabel, _ := idna.ToASCII(domain)

	// Helper to resolve a specific FQDN
	resolve := func(fqdn string) (AidRecord, uint32, error) {
		fqdn = strings.TrimSuffix(fqdn, ".")
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		txts, err := lookupTXT(ctx, fqdn)
		if err != nil {
			return AidRecord{}, 0, newAidError("ERR_DNS_LOOKUP_FAILED", err.Error())
		}
		var lastErr error
		var valid AidRecord
		validCount := 0
		for _, txt := range txts {
			rec, perr := Parse(txt)
			if perr == nil {
				valid = rec
				validCount++
				continue
			}
			lastErr = perr
		}
		if validCount == 1 {
			if valid.Pka != "" {
				if err := performPKAHandshake(valid.URI, valid.Pka, valid.Kid, timeout); err != nil {
					return AidRecord{}, 0, err
				}
			}
			return valid, 0, nil
		}
		if validCount > 1 {
			return AidRecord{}, 0, newAidError(
				"ERR_INVALID_TXT",
				fmt.Sprintf("Multiple valid AID records found for %s; publish exactly one valid record per queried DNS name", fqdn),
			)
		}
		if lastErr != nil {
			return AidRecord{}, 0, lastErr
		}
		return AidRecord{}, 0, newAidError("ERR_NO_RECORD", "No valid AID record in TXT answers")
	}

	// Query order
	var names []string
	if opts.Protocol != "" {
		names = append(names,
			DnsSubdomain+"._"+opts.Protocol+"."+alabel,
			DnsSubdomain+"."+opts.Protocol+"."+alabel,
		)
	}
	names = append(names, DnsSubdomain+"."+alabel)

	var lastErr *AidError
	for _, name := range names {
		rec, ttl, err := resolve(name)
		if err == nil {
			return rec, ttl, nil
		}
		if ae, ok := err.(*AidError); ok {
			lastErr = ae
			if ae.Symbol != "ERR_NO_RECORD" {
				// Only continue to next name on no-record; otherwise propagate
				break
			}
			continue
		}
		// Non-AidError: treat as DNS failure
		lastErr = newAidError("ERR_DNS_LOOKUP_FAILED", err.Error())
		break
	}

	// DNS failed → optionally fallback to well-known
	if opts.WellKnownFallback && lastErr != nil && (lastErr.Symbol == "ERR_NO_RECORD" || lastErr.Symbol == "ERR_DNS_LOOKUP_FAILED") {
		rec, werr := fetchWellKnown(alabel, firstNonZero(opts.WellKnownTimeout, 2*time.Second))
		if werr != nil {
			return AidRecord{}, 0, werr
		}
		if rec.Pka != "" {
			if err := performPKAHandshake(rec.URI, rec.Pka, rec.Kid, timeout); err != nil {
				return AidRecord{}, 0, err
			}
		}
		return rec, uint32(DnsTtlMin), nil
	}
	if lastErr != nil {
		return AidRecord{}, 0, lastErr
	}
	return AidRecord{}, 0, newAidError("ERR_DNS_LOOKUP_FAILED", "DNS query failed")
}

func firstNonZero(d time.Duration, def time.Duration) time.Duration {
	if d > 0 {
		return d
	}
	return def
}
