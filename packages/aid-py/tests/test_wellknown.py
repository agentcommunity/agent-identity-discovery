# MIT License
# Copyright (c) 2025 Agent Community
# Author: Agent Community
# Repository: https://github.com/agentcommunity/agent-identity-discovery
import sys, pathlib, json, types
import pytest

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from aid_py import discover, AidError  # noqa: E402


class _FakeHTTPMessage(dict):
    def items(self):
        return super().items()


class _FakeHTTPResponse:
    def __init__(self, status: int, headers: dict[str, str], body: str):
        self.status = status
        self.headers = _FakeHTTPMessage(headers)
        self._body = body.encode()

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_well_known_fallback_json(monkeypatch):
    # Make DNS resolution always fail
    import dns.resolver

    def _no_record(name, rdtype, lifetime=5.0):
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _no_record)

    # Patch urllib opener to return a small JSON document without following redirects
    import urllib.request

    def _fake_open(req, timeout=2.0):
        assert "/.well-known/agent" in req.full_url
        headers = {"Content-Type": "application/json"}
        payload = json.dumps({
            "v": "aid1",
            "u": "https://api.example.com/mcp",
            "p": "mcp",
            # no pka/kid to avoid crypto dependency in this test
        })
        return _FakeHTTPResponse(200, headers, payload)

    class _FakeOpener:
        def open(self, req, timeout=2.0):  # noqa: D401
            return _fake_open(req, timeout)

    monkeypatch.setattr(urllib.request, "build_opener", lambda *args, **kwargs: _FakeOpener())

    record, ttl = discover("example.com", well_known_fallback=True)
    assert record["proto"] == "mcp"
    assert record["uri"].startswith("https://")
    # TTL uses DNS_TTL_MIN for well-known path
    assert ttl >= 300
