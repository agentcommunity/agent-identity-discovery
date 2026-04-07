# MIT License
# Copyright (c) 2025 Agent Community
# Author: Agent Community
# Repository: https://github.com/agentcommunity/agent-identity-discovery

import sys, pathlib
sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

import pytest

from aid_py import parse, AidError, is_valid_proto


def test_parse_valid_record():
    txt = "v=aid1;uri=https://api.example.com/mcp;proto=mcp;auth=pat;desc=Test Agent"
    record = parse(txt)
    assert record == {
        "v": "aid1",
        "uri": "https://api.example.com/mcp",
        "proto": "mcp",
        "auth": "pat",
        "desc": "Test Agent",
    }


def test_parse_alias_p():
    txt = "v=aid1;uri=https://api.example.com/mcp;p=mcp"
    record = parse(txt)
    assert record == {
        "v": "aid1",
        "uri": "https://api.example.com/mcp",
        "proto": "mcp",
    }


def test_missing_version():
    txt = "uri=https://api.example.com/mcp;proto=mcp"
    with pytest.raises(AidError):
        parse(txt)


def test_invalid_proto():
    txt = "v=aid1;uri=https://api.example.com/mcp;proto=unknown"
    with pytest.raises(AidError):
        parse(txt)


def test_description_length():
    long_desc = "This is a very long description that exceeds the 60 UTF-8 byte limit for AID records"
    txt = f"v=aid1;uri=https://api.example.com/mcp;proto=mcp;desc={long_desc}"
    with pytest.raises(AidError):
        parse(txt)


def test_is_valid_proto():
    assert is_valid_proto("mcp") is True
    assert is_valid_proto("unknown") is False


def test_duplicate_keys():
    txt = "v=aid1;v=aid1;uri=https://api.example.com/mcp;proto=mcp"
    with pytest.raises(AidError, match="Duplicate key: v"):
        parse(txt)


@pytest.mark.parametrize("auth_field", ["auth", "a"])
def test_invalid_auth_token_both_aliases(auth_field):
    """Regression for #123: invalid auth passed via `a=` alias used to
    raise a raw KeyError instead of AidError, because the error path
    referenced raw['auth'] instead of the normalized value. Both the
    long key and the short alias must produce the same structured
    AidError with code ERR_INVALID_TXT."""
    txt = f"v=aid1;uri=https://api.example.com/mcp;proto=mcp;{auth_field}=bad"
    with pytest.raises(AidError) as exc_info:
        parse(txt)
    assert exc_info.value.error_code == "ERR_INVALID_TXT"
    assert "Invalid auth token: bad" in str(exc_info.value)