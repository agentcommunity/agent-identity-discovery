"""
GENERATED FILE - DO NOT EDIT

This file is auto-generated from protocol/constants.yml by scripts/generate-constants.ts
To make changes, edit the YAML file and run: pnpm gen
"""
from __future__ import annotations

from typing import Final, Dict, List

# ---------------------------------------------------------------------------
# Version
# ---------------------------------------------------------------------------

SPEC_VERSION_V1: Final[str] = "aid1"
SPEC_VERSION_V2: Final[str] = "aid2"
SPEC_VERSION: Final[str] = "aid2"
SUPPORTED_SPEC_VERSIONS: Final[List[str]] = [
    "aid1",
    "aid2",
]

# Version-specific raw record metadata. AidRecordV2 excludes legacy DNS kid/i.
AID_RECORD_V1_CANONICAL_FIELDS: Final[List[str]] = [
    "v",
    "uri",
    "proto",
    "auth",
    "desc",
    "docs",
    "dep",
    "pka",
    "kid",
]
AID_RECORD_V1_ALIAS_FIELDS: Final[List[str]] = [
    "p",
    "u",
    "a",
    "s",
    "d",
    "e",
    "k",
    "i",
]
AID_RECORD_V2_CANONICAL_FIELDS: Final[List[str]] = [
    "v",
    "uri",
    "proto",
    "auth",
    "desc",
    "docs",
    "dep",
    "pka",
]
AID_RECORD_V2_ALIAS_FIELDS: Final[List[str]] = [
    "p",
    "u",
    "a",
    "s",
    "d",
    "e",
    "k",
]

# ---------------------------------------------------------------------------
# Protocol tokens
# ---------------------------------------------------------------------------
PROTO_A2A: Final[str] = "a2a"
PROTO_GRAPHQL: Final[str] = "graphql"
PROTO_GRPC: Final[str] = "grpc"
PROTO_LOCAL: Final[str] = "local"
PROTO_MCP: Final[str] = "mcp"
PROTO_OPENAPI: Final[str] = "openapi"
PROTO_UCP: Final[str] = "ucp"
PROTO_WEBSOCKET: Final[str] = "websocket"
PROTO_ZEROCONF: Final[str] = "zeroconf"

PROTOCOL_TOKENS: Final[Dict[str, str]] = {
    "a2a": "a2a",
    "graphql": "graphql",
    "grpc": "grpc",
    "local": "local",
    "mcp": "mcp",
    "openapi": "openapi",
    "ucp": "ucp",
    "websocket": "websocket",
    "zeroconf": "zeroconf",
}

# ---------------------------------------------------------------------------
# Auth tokens
# ---------------------------------------------------------------------------
AUTH_APIKEY: Final[str] = "apikey"
AUTH_BASIC: Final[str] = "basic"
AUTH_CUSTOM: Final[str] = "custom"
AUTH_MTLS: Final[str] = "mtls"
AUTH_NONE: Final[str] = "none"
AUTH_OAUTH2_CODE: Final[str] = "oauth2_code"
AUTH_OAUTH2_DEVICE: Final[str] = "oauth2_device"
AUTH_PAT: Final[str] = "pat"

AUTH_TOKENS: Final[Dict[str, str]] = {
    "apikey": "apikey",
    "basic": "basic",
    "custom": "custom",
    "mtls": "mtls",
    "none": "none",
    "oauth2_code": "oauth2_code",
    "oauth2_device": "oauth2_device",
    "pat": "pat",
}

# ---------------------------------------------------------------------------
# Error codes & messages
# ---------------------------------------------------------------------------

ERR_DNS_LOOKUP_FAILED: Final[int] = 1004
ERR_FALLBACK_FAILED: Final[int] = 1005
ERR_INVALID_TXT: Final[int] = 1001
ERR_NO_RECORD: Final[int] = 1000
ERR_SECURITY: Final[int] = 1003
ERR_UNSUPPORTED_PROTO: Final[int] = 1002

ERROR_CODES: Final[Dict[str, int]] = {
    "ERR_DNS_LOOKUP_FAILED": ERR_DNS_LOOKUP_FAILED,
    "ERR_FALLBACK_FAILED": ERR_FALLBACK_FAILED,
    "ERR_INVALID_TXT": ERR_INVALID_TXT,
    "ERR_NO_RECORD": ERR_NO_RECORD,
    "ERR_SECURITY": ERR_SECURITY,
    "ERR_UNSUPPORTED_PROTO": ERR_UNSUPPORTED_PROTO,
}

ERROR_MESSAGES: Final[Dict[str, str]] = {
    "ERR_DNS_LOOKUP_FAILED": "The DNS query failed for a network-related reason",
    "ERR_FALLBACK_FAILED": "The .well-known fallback failed or returned invalid data",
    "ERR_INVALID_TXT": "A record was found but is malformed or missing required keys",
    "ERR_NO_RECORD": "No _agent TXT record was found for the domain",
    "ERR_SECURITY": "Discovery failed due to a security policy (e.g., DNSSEC failure, local execution denied)",
    "ERR_UNSUPPORTED_PROTO": "The record is valid, but the client does not support the specified protocol",
}

# ---------------------------------------------------------------------------
# Other spec constants
# ---------------------------------------------------------------------------

DNS_SUBDOMAIN: Final[str] = "_agent"
DNS_TTL_MIN: Final[int] = 300
DNS_TTL_MAX: Final[int] = 900

LOCAL_URI_SCHEMES: Final[List[str]] = [
    "docker",
    "npx",
    "pip",
]
