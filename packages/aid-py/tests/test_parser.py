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


def test_version_compatibility():
    txt = "version=aid1;u=https://api.example.com/mcp;proto=mcp"
    record = parse(txt)
    assert record["v"] == "aid1"
    assert record["proto"] == "mcp"


def test_version_duplicate_rejected():
    txt = "v=aid1;version=aid1;u=https://api.example.com/mcp;p=mcp"
    with pytest.raises(AidError, match="Cannot specify both \"version\" and \"v\""):
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
