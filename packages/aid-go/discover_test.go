package aid

import (
	"context"
	"testing"
	"time"
)

func TestDiscoverSuccess(t *testing.T) {
	// Mock lookupTXT
	lookupTXT = func(_ context.Context, _ string) ([]string, error) {
		return []string{"v=aid1;uri=https://api.example.com/mcp;proto=mcp"}, nil
	}

	rec, _, err := Discover("example.com", 2*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.Proto != "mcp" {
		t.Fatalf("expected proto mcp got %s", rec.Proto)
	}
}

func TestDiscoverNoRecord(t *testing.T) {
	lookupTXT = func(_ context.Context, _ string) ([]string, error) {
		return nil, context.DeadlineExceeded
	}
	_, _, err := Discover("missing.com", time.Second)
	if err == nil {
		t.Fatalf("expected error")
	}
}

func TestDiscoverWithProtocolStaysOnExactHost(t *testing.T) {
	var queries []string
	lookupTXT = func(_ context.Context, name string) ([]string, error) {
		queries = append(queries, name)
		switch name {
		case "_agent._mcp.app.team.example.com":
			return []string{}, nil
		case "_agent.mcp.app.team.example.com":
			return []string{}, nil
		case "_agent.app.team.example.com":
			return []string{"v=aid1;u=https://app.team.example.com/mcp;p=mcp"}, nil
		default:
			return []string{}, nil
		}
	}

	rec, _, err := DiscoverWithOptions("app.team.example.com", 2*time.Second, DiscoveryOptions{
		Protocol:          "mcp",
		WellKnownFallback: false,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.URI != "https://app.team.example.com/mcp" {
		t.Fatalf("expected exact-host record, got %s", rec.URI)
	}
	if len(queries) != 3 ||
		queries[0] != "_agent._mcp.app.team.example.com" ||
		queries[1] != "_agent.mcp.app.team.example.com" ||
		queries[2] != "_agent.app.team.example.com" {
		t.Fatalf("unexpected query order: %#v", queries)
	}
	for _, q := range queries {
		if q == "_agent._mcp.team.example.com" || q == "_agent.team.example.com" || q == "_agent.example.com" {
			t.Fatalf("unexpected parent fallback query: %s", q)
		}
	}
}

func TestDiscoverSucceedsWithOneValidAndOneMalformedTXT(t *testing.T) {
	lookupTXT = func(_ context.Context, _ string) ([]string, error) {
		return []string{
			"v=aid1;uri=http://bad.example.com;proto=mcp",
			"v=aid1;u=https://good.example.com;p=mcp",
		}, nil
	}

	rec, _, err := Discover("example.com", 2*time.Second)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if rec.URI != "https://good.example.com" {
		t.Fatalf("expected surviving valid record, got %s", rec.URI)
	}
}

func TestDiscoverFailsOnMultipleValidTXTAnswers(t *testing.T) {
	lookupTXT = func(_ context.Context, _ string) ([]string, error) {
		return []string{
			"v=aid1;uri=https://one.example.com;proto=mcp",
			"v=aid1;u=https://two.example.com;p=mcp",
		}, nil
	}

	_, _, err := Discover("example.com", 2*time.Second)
	if err == nil {
		t.Fatalf("expected ambiguity error")
	}
	aidErr, ok := err.(*AidError)
	if !ok {
		t.Fatalf("expected AidError, got %T", err)
	}
	if aidErr.Symbol != "ERR_INVALID_TXT" {
		t.Fatalf("expected ERR_INVALID_TXT, got %s", aidErr.Symbol)
	}
}
