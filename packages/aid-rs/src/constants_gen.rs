// GENERATED FILE - DO NOT EDIT

// Auto-generated from protocol/constants.yml by scripts/generate-constants.ts
// Run 'pnpm gen' to regenerate.

pub const SPEC_VERSION_V1: &str = "aid1";
pub const SPEC_VERSION_V2: &str = "aid2";
pub const SPEC_VERSION: &str = "aid2";
pub const SUPPORTED_SPEC_VERSIONS: &[&str] = &["aid1", "aid2"];

// Version-specific raw record metadata. AidRecordV2 excludes legacy DNS kid/i.
pub const AID_RECORD_V1_CANONICAL_FIELDS: &[&str] = &[
    "v", "uri", "proto", "auth", "desc", "docs", "dep", "pka", "kid",
];
pub const AID_RECORD_V1_ALIAS_FIELDS: &[&str] = &["p", "u", "a", "s", "d", "e", "k", "i"];
pub const AID_RECORD_V2_CANONICAL_FIELDS: &[&str] =
    &["v", "uri", "proto", "auth", "desc", "docs", "dep", "pka"];
pub const AID_RECORD_V2_ALIAS_FIELDS: &[&str] = &["p", "u", "a", "s", "d", "e", "k"];

// Protocol tokens
pub const PROTO_A2A: &str = "a2a";
pub const PROTO_GRAPHQL: &str = "graphql";
pub const PROTO_GRPC: &str = "grpc";
pub const PROTO_LOCAL: &str = "local";
pub const PROTO_MCP: &str = "mcp";
pub const PROTO_OPENAPI: &str = "openapi";
pub const PROTO_UCP: &str = "ucp";
pub const PROTO_WEBSOCKET: &str = "websocket";
pub const PROTO_ZEROCONF: &str = "zeroconf";

// Auth tokens
pub const AUTH_APIKEY: &str = "apikey";
pub const AUTH_BASIC: &str = "basic";
pub const AUTH_CUSTOM: &str = "custom";
pub const AUTH_MTLS: &str = "mtls";
pub const AUTH_NONE: &str = "none";
pub const AUTH_OAUTH2_CODE: &str = "oauth2_code";
pub const AUTH_OAUTH2_DEVICE: &str = "oauth2_device";
pub const AUTH_PAT: &str = "pat";

// Error codes (numeric codes only; human-readable messages are intentionally omitted
// from Rust/C#/Java constants — use ErrorMessages in Go/Python/TypeScript for display).
pub const ERR_DNS_LOOKUP_FAILED: u16 = 1004;
pub const ERR_FALLBACK_FAILED: u16 = 1005;
pub const ERR_INVALID_TXT: u16 = 1001;
pub const ERR_NO_RECORD: u16 = 1000;
pub const ERR_SECURITY: u16 = 1003;
pub const ERR_UNSUPPORTED_PROTO: u16 = 1002;

pub const DNS_SUBDOMAIN: &str = "_agent";
pub const DNS_TTL_MIN: u32 = 300;
pub const DNS_TTL_MAX: u32 = 900;

pub const LOCAL_URI_SCHEMES: &[&str] = &["docker", "npx", "pip"];
