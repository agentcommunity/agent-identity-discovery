# MIT License
# Copyright (c) 2025 Agent Community
# Author: Agent Community
# Repository: https://github.com/agentcommunity/agent-identity-discovery
import types, sys, pathlib
import pytest

sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

from aid_py import discover, AidError  # noqa: E402


class _FakeRdata:  # minimal stub
    def __init__(self, strings):
        self.strings = tuple(s.encode() for s in strings)


class _FakeAnswer(list):
    def __init__(self, strings_list, ttl):
        super().__init__(_FakeRdata([s]) for s in strings_list)
        rrset = types.SimpleNamespace()
        rrset.ttl = ttl
        self.rrset = rrset


@pytest.fixture()
def monkey_resolver(monkeypatch):
    import dns.resolver

    def _fake_resolve(name, rdtype, lifetime=5.0):
        assert rdtype == "TXT"
        if name == "_agent.example.com":
            return _FakeAnswer(["v=aid1;uri=https://api.example.com/mcp;proto=mcp"], 300)
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _fake_resolve)


def test_discover_success(monkey_resolver):  # pylint: disable=unused-argument
    record, ttl = discover("example.com")
    assert record["proto"] == "mcp"
    assert ttl == 300


def test_discover_protocol_specific_success_on_base(monkeypatch):
    import dns.resolver
    calls = []

    def _fake_resolve(name, rdtype, lifetime=5.0):
        calls.append(name)
        if name == "_agent.example.com":
            # Base record is used after protocol-specific names are exhausted
            return _FakeAnswer(["v=aid1;uri=https://api.example.com/mcp;proto=mcp"], 333)
        # No other records should be needed
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _fake_resolve)
    record, ttl = discover("example.com", protocol="mcp")
    assert record["proto"] == "mcp"
    assert record["uri"] == "https://api.example.com/mcp"
    assert ttl == 333
    assert calls == ["_agent._mcp.example.com", "_agent.mcp.example.com", "_agent.example.com"]

def test_discover_protocol_specific_fallback_to_subdomain(monkeypatch):
    import dns.resolver

    def _fake_resolve(name, rdtype, lifetime=5.0):
        if name == "_agent.example.com":
            # Base record has a different protocol
            return _FakeAnswer(["v=aid1;uri=https://api.example.com/fallback;p=a2a"], 444)
        if name == "_agent._mcp.example.com":
            # Protocol-specific subdomain has the correct one
            return _FakeAnswer(["v=aid1;uri=https://api.example.com/mcp_specific;proto=mcp"], 555)
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _fake_resolve)
    record, ttl = discover("example.com", protocol="mcp")
    assert record["proto"] == "mcp"
    assert record["uri"] == "https://api.example.com/mcp_specific"
    assert ttl == 555


def test_discover_fallback_to_base(monkeypatch):
    import dns.resolver
    calls = []

    def _fake_resolve(name, rdtype, lifetime=5.0):
        calls.append(name)
        if name == "_agent._mcp.example.com":
            raise dns.resolver.NXDOMAIN()
        if name == "_agent.mcp.example.com":
            raise dns.resolver.NXDOMAIN()
        if name == "_agent.example.com":
            return _FakeAnswer(["v=aid1;uri=https://fallback.com;p=a2a"], 555)
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _fake_resolve)
    record, ttl = discover("example.com", protocol="mcp")
    assert record["proto"] == "a2a"
    assert record["uri"] == "https://fallback.com"
    assert ttl == 555
    assert calls == ["_agent._mcp.example.com", "_agent.mcp.example.com", "_agent.example.com"]


def test_discover_no_record(monkeypatch):
    import dns.resolver

    def _no_record(name, rdtype, lifetime=5.0):
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _no_record)
    with pytest.raises(AidError):
        discover("missing.com") 
