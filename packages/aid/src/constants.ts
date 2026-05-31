/**
 * GENERATED FILE - DO NOT EDIT
 *
 * This file is auto-generated from protocol/constants.yml by scripts/generate-constants.ts
 * To make changes, edit the YAML file and run: pnpm gen
 */

// Specification versions
export const SPEC_VERSION_V1 = 'aid1' as const;
export const SPEC_VERSION_V2 = 'aid2' as const;
export const SPEC_VERSION = 'aid2' as const;
export const SUPPORTED_SPEC_VERSIONS = ['aid1', 'aid2'] as const;
export type AidSpecVersion = (typeof SUPPORTED_SPEC_VERSIONS)[number];

// Protocol tokens
export const PROTO_A2A = 'a2a' as const;
export const PROTO_GRAPHQL = 'graphql' as const;
export const PROTO_GRPC = 'grpc' as const;
export const PROTO_LOCAL = 'local' as const;
export const PROTO_MCP = 'mcp' as const;
export const PROTO_OPENAPI = 'openapi' as const;
export const PROTO_UCP = 'ucp' as const;
export const PROTO_WEBSOCKET = 'websocket' as const;
export const PROTO_ZEROCONF = 'zeroconf' as const;

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

// Authentication tokens
export const AUTH_APIKEY = 'apikey' as const;
export const AUTH_BASIC = 'basic' as const;
export const AUTH_CUSTOM = 'custom' as const;
export const AUTH_MTLS = 'mtls' as const;
export const AUTH_NONE = 'none' as const;
export const AUTH_OAUTH2_CODE = 'oauth2_code' as const;
export const AUTH_OAUTH2_DEVICE = 'oauth2_device' as const;
export const AUTH_PAT = 'pat' as const;

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

// Error codes
export const ERR_DNS_LOOKUP_FAILED = 1004 as const;
export const ERR_FALLBACK_FAILED = 1005 as const;
export const ERR_INVALID_TXT = 1001 as const;
export const ERR_NO_RECORD = 1000 as const;
export const ERR_SECURITY = 1003 as const;
export const ERR_UNSUPPORTED_PROTO = 1002 as const;

export const ERROR_CODES = {
  ERR_DNS_LOOKUP_FAILED: 1004,
  ERR_FALLBACK_FAILED: 1005,
  ERR_INVALID_TXT: 1001,
  ERR_NO_RECORD: 1000,
  ERR_SECURITY: 1003,
  ERR_UNSUPPORTED_PROTO: 1002,
} as const;

export const ERROR_MESSAGES = {
  ERR_DNS_LOOKUP_FAILED: 'The DNS query failed for a network-related reason',
  ERR_FALLBACK_FAILED: 'The .well-known fallback failed or returned invalid data',
  ERR_INVALID_TXT: 'A record was found but is malformed or missing required keys',
  ERR_NO_RECORD: 'No _agent TXT record was found for the domain',
  ERR_SECURITY:
    'Discovery failed due to a security policy (e.g., DNSSEC failure, local execution denied)',
  ERR_UNSUPPORTED_PROTO:
    'The record is valid, but the client does not support the specified protocol',
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

// AID Record structure
interface AidRecordCommon {
  /** uri */
  uri: string;
  /** proto */
  proto: ProtocolToken;
  /** auth (optional) */
  auth?: AuthToken;
  /** desc (optional) */
  desc?: string;
  /** docs (optional) */
  docs?: string;
  /** dep (optional) */
  dep?: string;
}

export interface AidRecordV1 extends AidRecordCommon {
  /** v */
  v: 'aid1';
  /** pka (optional) */
  pka?: string;
  /** kid (optional, required when pka is present) */
  kid?: string;
}

export interface AidRecordV2 extends AidRecordCommon {
  /** v */
  v: 'aid2';
  /** pka (optional) */
  pka?: string;
  /** kid is not allowed in aid2 records */
  kid?: never;
}

export type AidRecord = AidRecordV1 | AidRecordV2;

// Raw parsed record (before validation)
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

// Version-specific raw record metadata. AidRecord remains compatibility-facing,
// while AidRecordV2 deliberately excludes legacy DNS kid/i.
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

// DNS configuration
export const DNS_SUBDOMAIN = '_agent' as const;
export const DNS_TTL_MIN = 300 as const;
export const DNS_TTL_MAX = 900 as const;

// Local URI schemes
export const LOCAL_URI_SCHEMES = ['docker', 'npx', 'pip'] as const;

export type LocalUriScheme = (typeof LOCAL_URI_SCHEMES)[number];
