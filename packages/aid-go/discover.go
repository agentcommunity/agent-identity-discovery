package aid

import (
	"context"
	"errors"
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
	// Protocol: when set, try _agent._<proto>.<domain> before base.
	Protocol string
	// WellKnownFallback: if true, attempt HTTPS .well-known fallback on ERR_NO_RECORD or ERR_DNS_LOOKUP_FAILED.
	WellKnownFallback bool
	// WellKnownTimeout: timeout for the .well-known HTTP fetch.
	WellKnownTimeout time.Duration
}

// DiscoveryResult carries the resolved record, its TTL, and whether the PKA
// handshake produced a domain-bound proof for the queried domain.
type DiscoveryResult struct {
	Record      AidRecord
	TTL         uint32
	DomainBound bool
}

// Discover retains the original signature for backward compatibility.
// It performs DNS-first discovery and falls back to HTTPS .well-known.
func Discover(domain string, timeout time.Duration) (AidRecord, uint32, error) {
	opts := DiscoveryOptions{WellKnownFallback: true, WellKnownTimeout: 2 * time.Second}
	res, err := DiscoverWithOptions(domain, timeout, opts)
	return res.Record, res.TTL, err
}

func classifyLookupError(err error) *AidError {
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) && dnsErr.IsNotFound {
		return newAidError("ERR_NO_RECORD", err.Error())
	}
	return newAidError("ERR_DNS_LOOKUP_FAILED", err.Error())
}

// DiscoverWithOptions performs discovery with protocol-specific DNS flow and well-known controls.
func DiscoverWithOptions(domain string, timeout time.Duration, opts DiscoveryOptions) (DiscoveryResult, error) {
	// IDN → A-label
	alabel, _ := idna.ToASCII(domain)

	// Helper to resolve a specific FQDN
	resolve := func(fqdn string) (DiscoveryResult, error) {
		fqdn = strings.TrimSuffix(fqdn, ".")
		ctx, cancel := context.WithTimeout(context.Background(), timeout)
		defer cancel()
		txts, err := lookupTXT(ctx, fqdn)
		if err != nil {
			return DiscoveryResult{}, classifyLookupError(err)
		}
		var lastErr error
		validByVersion := map[string][]AidRecord{
			SpecVersionV1: {},
			SpecVersionV2: {},
		}
		for _, txt := range txts {
			rec, perr := Parse(txt)
			if perr == nil {
				validByVersion[rec.V] = append(validByVersion[rec.V], rec)
				continue
			}
			lastErr = perr
		}

		selectedVersion := ""
		if len(validByVersion[SpecVersionV2]) > 0 {
			selectedVersion = SpecVersionV2
		} else if len(validByVersion[SpecVersionV1]) > 0 {
			selectedVersion = SpecVersionV1
		}
		if selectedVersion != "" {
			selected := validByVersion[selectedVersion]
			if len(selected) > 1 {
				return DiscoveryResult{}, newAidError(
					"ERR_INVALID_TXT",
					fmt.Sprintf("Multiple valid %s AID records found for %s; publish exactly one valid record per queried DNS name", selectedVersion, fqdn),
				)
			}
			valid := selected[0]
			domainBound := false
			if valid.Pka != "" {
				pkaResult, err := performPKAHandshake(valid.URI, valid.Pka, valid.Kid, alabel, timeout)
				if err != nil {
					return DiscoveryResult{}, err
				}
				domainBound = pkaResult.DomainBound
			}
			return DiscoveryResult{Record: valid, TTL: 0, DomainBound: domainBound}, nil
		}
		if lastErr != nil {
			return DiscoveryResult{}, lastErr
		}
		return DiscoveryResult{}, newAidError("ERR_NO_RECORD", "No valid AID record in TXT answers")
	}

	// Query order
	var names []string
	if opts.Protocol != "" {
		names = append(names, DnsSubdomain+"._"+opts.Protocol+"."+alabel)
	}
	names = append(names, DnsSubdomain+"."+alabel)

	var lastErr *AidError
	for _, name := range names {
		res, err := resolve(name)
		if err == nil {
			return res, nil
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
			return DiscoveryResult{}, werr
		}
		domainBound := false
		if rec.Pka != "" {
			pkaResult, err := performPKAHandshake(rec.URI, rec.Pka, rec.Kid, alabel, timeout)
			if err != nil {
				return DiscoveryResult{}, err
			}
			domainBound = pkaResult.DomainBound
		}
		return DiscoveryResult{Record: rec, TTL: uint32(DnsTtlMin), DomainBound: domainBound}, nil
	}
	if lastErr != nil {
		return DiscoveryResult{}, lastErr
	}
	return DiscoveryResult{}, newAidError("ERR_DNS_LOOKUP_FAILED", "DNS query failed")
}

func firstNonZero(d time.Duration, def time.Duration) time.Duration {
	if d > 0 {
		return d
	}
	return def
}
