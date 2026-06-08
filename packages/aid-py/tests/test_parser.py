# MIT License
# Copyright (c) 2025 Agent Community
# Author: Agent Community
# Repository: https://github.com/agentcommunity/agent-identity-discovery

import sys, pathlib
sys.path.append(str(pathlib.Path(__file__).resolve().parents[1]))

import pytest

from aid_py import AidRecordV1, AidRecordV2, as_v1, as_v2, parse, AidError, is_valid_proto


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


def test_parse_aid1_keeps_legacy_multibase_pka_and_kid():
    txt = "v=aid1;uri=https://api.example.com/mcp;p=mcp;k=z1111111111111111111111111111111111111111111;i=g1"
    record = parse(txt)
    assert record["v"] == "aid1"
    assert record["pka"] == "z1111111111111111111111111111111111111111111"
    assert record["kid"] == "g1"


def test_parse_aid2_accepts_unpadded_base64url_ed25519_jwk_x():
    key_x = "ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ"
    txt = f"v=aid2;uri=https://api.example.com/mcp;p=mcp;k={key_x}"
    record = parse(txt)
    assert record == {
        "v": "aid2",
        "uri": "https://api.example.com/mcp",
        "proto": "mcp",
        "pka": key_x,
    }
    assert "kid" not in record


@pytest.mark.parametrize("kid_field", ["kid", "i"])
def test_parse_aid2_rejects_kid(kid_field):
    key_x = "ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ"
    txt = f"v=aid2;uri=https://api.example.com/mcp;p=mcp;k={key_x};{kid_field}=g1"
    with pytest.raises(AidError) as exc_info:
        parse(txt)
    assert exc_info.value.error_code == "ERR_INVALID_TXT"


def test_aid1_versioned_contract_projection_retains_kid():
    txt = "v=aid1;uri=https://api.example.com/mcp;p=mcp;k=z1111111111111111111111111111111111111111111;i=g1"
    record = parse(txt)

    versioned: AidRecordV1 | None = as_v1(record)

    assert versioned == record
    assert versioned is not None
    assert versioned["kid"] == "g1"
    assert as_v2(record) is None


def test_aid2_versioned_contract_projection_excludes_and_rejects_kid():
    key_x = "ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ"
    record = parse(f"v=aid2;uri=https://api.example.com/mcp;p=mcp;k={key_x}")

    versioned: AidRecordV2 | None = as_v2(record)

    assert versioned == record
    assert versioned is not None
    assert "kid" not in versioned
    assert as_v1(record) is None
    assert as_v2({**record, "kid": "legacy-kid"}) is None


@pytest.mark.parametrize("key_x", ["z1111111111111111111111111111111111111111111", "abc", "ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ="])
def test_parse_aid2_rejects_invalid_key(key_x):
    txt = f"v=aid2;uri=https://api.example.com/mcp;p=mcp;k={key_x}"
    with pytest.raises(AidError) as exc_info:
        parse(txt)
    assert exc_info.value.error_code == "ERR_INVALID_TXT"


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
