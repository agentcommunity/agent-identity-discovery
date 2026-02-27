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

    def _fake_resolve(name, rdtype, lifetime=5.0):
        if name == "_agent.example.com":
            # Base record has the desired protocol
            return _FakeAnswer(["v=aid1;uri=https://api.example.com/mcp;proto=mcp"], 333)
        # No other records should be needed
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _fake_resolve)
    record, ttl = discover("example.com", protocol="mcp")
    assert record["proto"] == "mcp"
    assert record["uri"] == "https://api.example.com/mcp"
    assert ttl == 333

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

    def _fake_resolve(name, rdtype, lifetime=5.0):
        if name == "_agent._mcp.example.com":
            raise dns.resolver.NXDOMAIN()
        if name == "_agent.example.com":
            return _FakeAnswer(["v=aid1;uri=https://fallback.com;p=a2a"], 555)
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _fake_resolve)
    record, ttl = discover("example.com", protocol="mcp")
    assert record["proto"] == "a2a"
    assert record["uri"] == "https://fallback.com"
    assert ttl == 555


def test_discover_no_record(monkeypatch):
    import dns.resolver

    def _no_record(name, rdtype, lifetime=5.0):
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _no_record)
    with pytest.raises(AidError):
        discover("missing.com") 


def test_discover_queries_only_exact_host(monkeypatch):
    import dns.resolver

    queries = []

    def _fake_resolve(name, rdtype, lifetime=5.0):
        queries.append(name)
        if name == "_agent.app.team.example.com":
            return _FakeAnswer(["v=aid1;u=https://app.team.example.com/mcp;p=mcp"], 300)
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _fake_resolve)
    record, ttl = discover("app.team.example.com")
    assert record["uri"] == "https://app.team.example.com/mcp"
    assert ttl == 300
    assert queries == ["_agent.app.team.example.com"]
    assert "_agent.team.example.com" not in queries
    assert "_agent.example.com" not in queries


def test_discover_succeeds_with_one_valid_and_one_malformed(monkeypatch):
    import dns.resolver

    def _fake_resolve(name, rdtype, lifetime=5.0):
        if name == "_agent.example.com":
            return _FakeAnswer(
                [
                    "v=aid1;uri=http://bad.example.com;proto=mcp",
                    "v=aid1;u=https://good.example.com;p=mcp",
                ],
                300,
            )
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _fake_resolve)
    record, ttl = discover("example.com")
    assert record["uri"] == "https://good.example.com"
    assert ttl == 300


def test_discover_fails_on_multiple_valid_answers(monkeypatch):
    import dns.resolver

    def _fake_resolve(name, rdtype, lifetime=5.0):
        if name == "_agent.example.com":
            return _FakeAnswer(
                [
                    "v=aid1;uri=https://one.example.com;proto=mcp",
                    "v=aid1;u=https://two.example.com;p=mcp",
                ],
                300,
            )
        raise dns.resolver.NXDOMAIN()

    monkeypatch.setattr(dns.resolver, "resolve", _fake_resolve)
    with pytest.raises(AidError, match="Multiple valid AID records found"):
        discover("example.com")
