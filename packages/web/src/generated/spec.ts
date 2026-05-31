// GENERATED FILE - DO NOT EDIT

// Auto-generated from protocol/constants.yml by scripts/generate-constants.ts
// Run 'pnpm gen' after updating the YAML.

// ---- Version ----
export const SPEC_VERSION_V1 = 'aid1' as const;
export const SPEC_VERSION_V2 = 'aid2' as const;
export const SPEC_VERSION = 'aid2' as const;
export const SUPPORTED_SPEC_VERSIONS = ['aid1', 'aid2'] as const;
export type AidSpecVersion = (typeof SUPPORTED_SPEC_VERSIONS)[number];

// ---- Tokens ----
export const PROTO_A2A = 'a2a' as const;
export const PROTO_GRAPHQL = 'graphql' as const;
export const PROTO_GRPC = 'grpc' as const;
export const PROTO_LOCAL = 'local' as const;
export const PROTO_MCP = 'mcp' as const;
export const PROTO_OPENAPI = 'openapi' as const;
export const PROTO_UCP = 'ucp' as const;
export const PROTO_WEBSOCKET = 'websocket' as const;
export const PROTO_ZEROCONF = 'zeroconf' as const;
export const AUTH_APIKEY = 'apikey' as const;
export const AUTH_BASIC = 'basic' as const;
export const AUTH_CUSTOM = 'custom' as const;
export const AUTH_MTLS = 'mtls' as const;
export const AUTH_NONE = 'none' as const;
export const AUTH_OAUTH2_CODE = 'oauth2_code' as const;
export const AUTH_OAUTH2_DEVICE = 'oauth2_device' as const;
export const AUTH_PAT = 'pat' as const;

export const PROTOCOL_TOKENS = {
  a2a: 'a2a',
  graphql: 'graphql',
  grpc: 'grpc',
  local: 'local',
  mcp: 'mcp',
  openapi: 'openapi',
  ucp: 'ucp',
  websocket: 'websocket',
  zeroconf: 'zeroconf',
} as const;
export type ProtocolToken = keyof typeof PROTOCOL_TOKENS;

export const AUTH_TOKENS = {
  apikey: 'apikey',
  basic: 'basic',
  custom: 'custom',
  mtls: 'mtls',
  none: 'none',
  oauth2_code: 'oauth2_code',
  oauth2_device: 'oauth2_device',
  pat: 'pat',
} as const;
export type AuthToken = keyof typeof AUTH_TOKENS;

// ---- Error codes ----
export const ERROR_CODES = {
  ERR_DNS_LOOKUP_FAILED: 1004,
  ERR_FALLBACK_FAILED: 1005,
  ERR_INVALID_TXT: 1001,
  ERR_NO_RECORD: 1000,
  ERR_SECURITY: 1003,
  ERR_UNSUPPORTED_PROTO: 1002,
} as const;
export type ErrorCodeName = keyof typeof ERROR_CODES;
export type ErrorCode = (typeof ERROR_CODES)[ErrorCodeName];

export const ERROR_CATALOG: Record<ErrorCodeName, { code: number; message: string }> = {
  ERR_DNS_LOOKUP_FAILED: {
    code: 1004,
    message: 'The DNS query failed for a network-related reason',
  },
  ERR_FALLBACK_FAILED: {
    code: 1005,
    message: 'The .well-known fallback failed or returned invalid data',
  },
  ERR_INVALID_TXT: {
    code: 1001,
    message: 'A record was found but is malformed or missing required keys',
  },
  ERR_NO_RECORD: { code: 1000, message: 'No _agent TXT record was found for the domain' },
  ERR_SECURITY: {
    code: 1003,
    message:
      'Discovery failed due to a security policy (e.g., DNSSEC failure, local execution denied)',
  },
  ERR_UNSUPPORTED_PROTO: {
    code: 1002,
    message: 'The record is valid, but the client does not support the specified protocol',
  },
};

// ---- DNS / Local Schemes ----
export const DNS_SUBDOMAIN = '_agent' as const;
export const DNS_TTL_MIN = 300 as const;
export const DNS_TTL_MAX = 900 as const;
export const LOCAL_URI_SCHEMES = ['docker', 'npx', 'pip'] as const;
export type LocalUriScheme = (typeof LOCAL_URI_SCHEMES)[number];

// ---- Record types ----
/**
 * AID TXT record as specified by the current spec version.
 * This is the raw, spec-shaped record (before any UI normalization).
 */
interface AidRecordCommon {
  uri: string;
  proto: ProtocolToken;
  auth?: AuthToken;
  desc?: string;
  docs?: string;
  dep?: string;
}

export interface AidRecordV1 extends AidRecordCommon {
  v: 'aid1';
  pka?: string;
  kid?: string;
}

export interface AidRecordV2 extends AidRecordCommon {
  v: 'aid2';
  pka?: string;
  kid?: never;
}

export type AidRecord = AidRecordV1 | AidRecordV2;

// Version-specific raw record metadata. AidRecordV2 excludes legacy DNS kid/i.
export const AID_RECORD_V1_CANONICAL_FIELDS = [
  'v',
  'uri',
  'proto',
  'auth',
  'desc',
  'docs',
  'dep',
  'pka',
  'kid',
] as const;
export const AID_RECORD_V1_ALIAS_FIELDS = ['p', 'u', 'a', 's', 'd', 'e', 'k', 'i'] as const;
export const AID_RECORD_V2_CANONICAL_FIELDS = [
  'v',
  'uri',
  'proto',
  'auth',
  'desc',
  'docs',
  'dep',
  'pka',
] as const;
export const AID_RECORD_V2_ALIAS_FIELDS = ['p', 'u', 'a', 's', 'd', 'e', 'k'] as const;

/** Raw, partially parsed record shape (before validation) */
export interface RawAidRecord {
  v?: string;
  uri?: string;
  proto?: string;
  auth?: string;
  desc?: string;
  docs?: string;
  dep?: string;
  pka?: string;
  kid?: string;
  p?: string;
  u?: string;
  a?: string;
  s?: string;
  d?: string;
  e?: string;
  k?: string;
  i?: string;
}

// ---- Handshake types (minimal for UI) ----
export interface HandshakeV1 {
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  capabilities: { id: string; type: 'tool' | 'resource'; name?: string; description?: string }[];
}
