#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';
import { parse } from 'yaml';
import prettier from 'prettier';
import { execSync } from 'child_process';

/**
 * Code generation script for AID protocol constants
 *
 * This script reads protocol/constants.yml and generates constants for all
 * supported languages: TypeScript, Python, and Go. It produces deterministic
 * output by sorting keys alphabetically to ensure stable git diffs.
 */

interface ErrorCode {
  code: number;
  description?: string;
  message?: string;
}

interface AidRecord {
  required: string[];
  optional: string[];
  aliases: Record<string, string>;
}

interface DnsConfig {
  subdomain: string;
  ttlRecommendation: {
    min: number;
    max: number;
  };
}

interface ProtocolConstants {
  schemaVersion: string;
  specVersion: string;
  supportedSpecVersions?: string[];
  protocolTokens: Record<string, string>;
  authTokens: Record<string, string>;
  errorCodes: Record<string, ErrorCode>;
  aidRecord: AidRecord;
  localUriSchemes: string[];
  dns: DnsConfig;
}

const GENERATED_WARNING = `/**
 * GENERATED FILE - DO NOT EDIT
 * 
 * This file is auto-generated from protocol/constants.yml by scripts/generate-constants.ts
 * To make changes, edit the YAML file and run: pnpm gen
 */`;

function getRecordContractMetadata(constants: ProtocolConstants) {
  const req = constants.aidRecord.required;
  const opt = constants.aidRecord.optional;
  const aliasMap = constants.aidRecord.aliases || {};
  const v2CanonicalFields = [...new Set([...req, ...opt])];
  const v2AliasFields = [...Object.keys(aliasMap)];
  const v1CanonicalFields = v2CanonicalFields.includes('kid')
    ? v2CanonicalFields
    : [...v2CanonicalFields, 'kid'];
  const v1AliasFields = v2AliasFields.includes('i') ? v2AliasFields : [...v2AliasFields, 'i'];

  return {
    v1CanonicalFields,
    v1AliasFields,
    v2CanonicalFields,
    v2AliasFields,
  };
}

function tsReadonlyArray(values: string[]): string {
  return `[\n${values.map((value) => `  '${value}',`).join('\n')}\n] as const`;
}

function pyList(values: string[]): string {
  return `[\n${values.map((value) => `    "${value}",`).join('\n')}\n]`;
}

function goStringSlice(values: string[]): string {
  return `[]string{\n${values.map((value) => `\t"${value}",`).join('\n')}\n}`;
}

function rustStrSlice(values: string[]): string {
  return `&[${values.map((value) => `"${value}"`).join(', ')}]`;
}

function csStringArray(values: string[]): string {
  return `new string[] { ${values.map((value) => `"${value}"`).join(', ')} }`;
}

function javaStringArray(values: string[]): string {
  return `new String[] {${values.map((value) => `"${value}"`).join(', ')} }`;
}

function generateTypeScriptConstants(constants: ProtocolConstants): string {
  const sortedProtocolTokens = Object.keys(constants.protocolTokens).sort();
  const sortedAuthTokens = Object.keys(constants.authTokens).sort();
  const sortedErrorCodes = Object.keys(constants.errorCodes).sort();
  const supportedSpecVersions =
    constants.supportedSpecVersions && constants.supportedSpecVersions.length > 0
      ? constants.supportedSpecVersions
      : [constants.specVersion];
  const recordContract = getRecordContractMetadata(constants);

  // Build dynamic AidRecord and RawAidRecord shapes from YAML
  const req = constants.aidRecord.required;
  const opt = constants.aidRecord.optional;
  const aliasMap = constants.aidRecord.aliases || {};

  const allCanonKeys = [...new Set([...req, ...opt])];
  const allAliasKeys = [...new Set([...Object.keys(aliasMap), 'i'])];

  const tsTypeForField = (field: string): string => {
    if (field === 'v') return `"${constants.specVersion}"`;
    if (field === 'proto') return 'ProtocolToken';
    if (field === 'auth') return 'AuthToken';
    return 'string';
  };

  const commonOptional = opt.filter((field) => field !== 'pka' && field !== 'kid');
  const aidRecordInterface = `// AID Record structure
interface AidRecordCommon {
  /** uri */
  uri: string;
  /** proto */
  proto: ProtocolToken;
${commonOptional.map((f) => `  /** ${f} (optional) */\n  ${f}?: ${tsTypeForField(f)};`).join('\n')}
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

export type AidRecord = AidRecordV1 | AidRecordV2;`;

  const rawAidRecordInterface = `// Raw parsed record (before validation)
export interface RawAidRecord {
${allCanonKeys.map((f) => `  ${f}?: string;`).join('\n')}
  kid?: string;
${allAliasKeys.map((f) => `  ${f}?: string;`).join('\n')}
}`;

  return `${GENERATED_WARNING}

// Specification versions
export const SPEC_VERSION_V1 = 'aid1' as const;
export const SPEC_VERSION_V2 = 'aid2' as const;
export const SPEC_VERSION = '${constants.specVersion}' as const;
export const SUPPORTED_SPEC_VERSIONS = [
${supportedSpecVersions.map((version) => `  '${version}',`).join('\n')}
] as const;
export type AidSpecVersion = typeof SUPPORTED_SPEC_VERSIONS[number];

// Protocol tokens
${sortedProtocolTokens
  .map((token) => `export const PROTO_${token.toUpperCase()} = '${token}' as const;`)
  .join('\n')}

export const PROTOCOL_TOKENS = {
${sortedProtocolTokens.map((token) => `  ${token}: '${token}',`).join('\n')}
} as const;

export type ProtocolToken = keyof typeof PROTOCOL_TOKENS;

// Authentication tokens
${sortedAuthTokens
  .map((token) => `export const AUTH_${token.toUpperCase()} = '${token}' as const;`)
  .join('\n')}

export const AUTH_TOKENS = {
${sortedAuthTokens.map((token) => `  ${token}: '${token}',`).join('\n')}
} as const;

export type AuthToken = keyof typeof AUTH_TOKENS;

// Error codes
${sortedErrorCodes
  .map(
    (errorName) => `export const ${errorName} = ${constants.errorCodes[errorName].code} as const;`,
  )
  .join('\n')}

export const ERROR_CODES = {
${sortedErrorCodes
  .map((errorName) => `  ${errorName}: ${constants.errorCodes[errorName].code},`)
  .join('\n')}
} as const;

export const ERROR_MESSAGES = {
${sortedErrorCodes
  .map((errorName) => {
    const raw =
      constants.errorCodes[errorName].description ?? constants.errorCodes[errorName].message ?? '';
    const escaped = String(raw).replace(/'/g, "\\'");
    return `  ${errorName}: '${escaped}',`;
  })
  .join('\n')}
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

${aidRecordInterface}

${rawAidRecordInterface}

// Version-specific raw record metadata. AidRecord remains compatibility-facing,
// while AidRecordV2 deliberately excludes legacy DNS kid/i.
export const AID_RECORD_V1_CANONICAL_FIELDS = ${tsReadonlyArray(recordContract.v1CanonicalFields)};
export const AID_RECORD_V1_ALIAS_FIELDS = ${tsReadonlyArray(recordContract.v1AliasFields)};
export const AID_RECORD_V2_CANONICAL_FIELDS = ${tsReadonlyArray(recordContract.v2CanonicalFields)};
export const AID_RECORD_V2_ALIAS_FIELDS = ${tsReadonlyArray(recordContract.v2AliasFields)};

// DNS configuration
export const DNS_SUBDOMAIN = '${constants.dns.subdomain}' as const;
export const DNS_TTL_MIN = ${constants.dns.ttlRecommendation.min} as const;
export const DNS_TTL_MAX = ${constants.dns.ttlRecommendation.max} as const;

// Local URI schemes
export const LOCAL_URI_SCHEMES = [
${constants.localUriSchemes.map((scheme) => `  '${scheme}',`).join('\n')}
] as const;

export type LocalUriScheme = typeof LOCAL_URI_SCHEMES[number];

`;
}

/**
 * Generate a TypeScript module for the Web workbench only.
 *
 * Purpose: expose spec-derived types and small constant maps used by the
 * Next.js app. Keep this output tiny and tree‑shakeable — no large schemas.
 */
function generateWebSpecModule(constants: ProtocolConstants): string {
  const sortedProtocolTokens = Object.keys(constants.protocolTokens).sort();
  const sortedAuthTokens = Object.keys(constants.authTokens).sort();
  const sortedErrorCodes = Object.keys(constants.errorCodes).sort();
  const supportedSpecVersions =
    constants.supportedSpecVersions && constants.supportedSpecVersions.length > 0
      ? constants.supportedSpecVersions
      : [constants.specVersion];
  const req = constants.aidRecord.required;
  const opt = constants.aidRecord.optional;
  const aliasMap = constants.aidRecord.aliases || {};
  const allCanonKeys = [...new Set([...req, ...opt])];
  const allAliasKeys = [...new Set([...Object.keys(aliasMap), 'i'])];
  const recordContract = getRecordContractMetadata(constants);
  const tsTypeForField = (field: string): string => {
    if (field === 'v') return `"${constants.specVersion}"`;
    if (field === 'proto') return 'ProtocolToken';
    if (field === 'auth') return 'AuthToken';
    return 'string';
  };

  const header = `// GENERATED FILE - DO NOT EDIT\n\n// Auto-generated from protocol/constants.yml by scripts/generate-constants.ts\n// Run 'pnpm gen' after updating the YAML.\n`;

  const aidRecordDoc = `/**\n * AID TXT record as specified by the current spec version.\n * This is the raw, spec-shaped record (before any UI normalization).\n */`;

  return (
    header +
    `\n// ---- Version ----\n` +
    `export const SPEC_VERSION_V1 = 'aid1' as const;\n` +
    `export const SPEC_VERSION_V2 = 'aid2' as const;\n` +
    `export const SPEC_VERSION = '${constants.specVersion}' as const;\n` +
    `export const SUPPORTED_SPEC_VERSIONS = [${supportedSpecVersions.map((version) => `'${version}'`).join(', ')}] as const;\n` +
    `export type AidSpecVersion = (typeof SUPPORTED_SPEC_VERSIONS)[number];\n` +
    `\n// ---- Tokens ----\n` +
    sortedProtocolTokens
      .map((t) => `export const PROTO_${t.toUpperCase()} = '${t}' as const;`)
      .join('\n') +
    `\n` +
    sortedAuthTokens
      .map((t) => `export const AUTH_${t.toUpperCase()} = '${t}' as const;`)
      .join('\n') +
    `\n\nexport const PROTOCOL_TOKENS = {\n` +
    sortedProtocolTokens.map((t) => `  ${t}: '${t}',`).join('\n') +
    `\n} as const;\n` +
    `export type ProtocolToken = keyof typeof PROTOCOL_TOKENS;\n` +
    `\nexport const AUTH_TOKENS = {\n` +
    sortedAuthTokens.map((t) => `  ${t}: '${t}',`).join('\n') +
    `\n} as const;\n` +
    `export type AuthToken = keyof typeof AUTH_TOKENS;\n` +
    `\n// ---- Error codes ----\n` +
    `export const ERROR_CODES = {\n` +
    sortedErrorCodes.map((name) => `  ${name}: ${constants.errorCodes[name].code},`).join('\n') +
    `\n} as const;\n` +
    `export type ErrorCodeName = keyof typeof ERROR_CODES;\n` +
    `export type ErrorCode = (typeof ERROR_CODES)[ErrorCodeName];\n` +
    `\nexport const ERROR_CATALOG: Record<ErrorCodeName, { code: number; message: string }> = {\n` +
    sortedErrorCodes
      .map((name) => {
        const msg =
          constants.errorCodes[name].description ?? constants.errorCodes[name].message ?? '';
        return `  ${name}: { code: ${constants.errorCodes[name].code}, message: '${msg.replace(/'/g, "\\'")}' },`;
      })
      .join('\n') +
    `\n};\n` +
    `\n// ---- DNS / Local Schemes ----\n` +
    `export const DNS_SUBDOMAIN = '${constants.dns.subdomain}' as const;\n` +
    `export const DNS_TTL_MIN = ${constants.dns.ttlRecommendation.min} as const;\n` +
    `export const DNS_TTL_MAX = ${constants.dns.ttlRecommendation.max} as const;\n` +
    `export const LOCAL_URI_SCHEMES = [${constants.localUriSchemes.map((s) => `'${s}'`).join(', ')}] as const;\n` +
    `export type LocalUriScheme = (typeof LOCAL_URI_SCHEMES)[number];\n` +
    `\n// ---- Record types ----\n` +
    `${aidRecordDoc}\n` +
    `interface AidRecordCommon {\n` +
    `  uri: string;\n` +
    `  proto: ProtocolToken;\n` +
    opt
      .filter((f) => f !== 'pka' && f !== 'kid')
      .map((f) => `  ${f}?: ${tsTypeForField(f)};`)
      .join('\n') +
    `\n}\n` +
    `\nexport interface AidRecordV1 extends AidRecordCommon {\n` +
    `  v: 'aid1';\n` +
    `  pka?: string;\n` +
    `  kid?: string;\n` +
    `}\n` +
    `\nexport interface AidRecordV2 extends AidRecordCommon {\n` +
    `  v: 'aid2';\n` +
    `  pka?: string;\n` +
    `  kid?: never;\n` +
    `}\n` +
    `\nexport type AidRecord = AidRecordV1 | AidRecordV2;\n` +
    `\n// Version-specific raw record metadata. AidRecordV2 excludes legacy DNS kid/i.\n` +
    `export const AID_RECORD_V1_CANONICAL_FIELDS = ${tsReadonlyArray(recordContract.v1CanonicalFields)};\n` +
    `export const AID_RECORD_V1_ALIAS_FIELDS = ${tsReadonlyArray(recordContract.v1AliasFields)};\n` +
    `export const AID_RECORD_V2_CANONICAL_FIELDS = ${tsReadonlyArray(recordContract.v2CanonicalFields)};\n` +
    `export const AID_RECORD_V2_ALIAS_FIELDS = ${tsReadonlyArray(recordContract.v2AliasFields)};\n` +
    `\n/** Raw, partially parsed record shape (before validation) */\n` +
    `export interface RawAidRecord {\n` +
    allCanonKeys.map((f) => `  ${f}?: string;`).join(' ') +
    ' kid?: string;' +
    ' ' +
    allAliasKeys.map((f) => `  ${f}?: string;`).join(' ') +
    `\n}\n` +
    `\n// ---- Handshake types (minimal for UI) ----\n` +
    `export interface HandshakeV1 {\n` +
    `  protocolVersion: string;\n` +
    `  serverInfo: { name: string; version: string };\n` +
    `  capabilities: { id: string; type: 'tool' | 'resource'; name?: string; description?: string }[];\n` +
    `}\n`
  );
}

function generatePythonConstants(constants: ProtocolConstants): string {
  const sortedProtocolTokens = Object.keys(constants.protocolTokens).sort();
  const sortedAuthTokens = Object.keys(constants.authTokens).sort();
  const sortedErrorCodes = Object.keys(constants.errorCodes).sort();
  const supportedSpecVersions =
    constants.supportedSpecVersions && constants.supportedSpecVersions.length > 0
      ? constants.supportedSpecVersions
      : [constants.specVersion];
  const recordContract = getRecordContractMetadata(constants);

  const pythonWarning = `"""
GENERATED FILE - DO NOT EDIT

This file is auto-generated from protocol/constants.yml by scripts/generate-constants.ts
To make changes, edit the YAML file and run: pnpm gen
"""`;

  // Helper to escape quotes inside a Python string literal
  const escapePy = (str: string) => str.replace(/"/g, '\\"');

  return `${pythonWarning}
from __future__ import annotations

from typing import Final, Dict, List

# ---------------------------------------------------------------------------
# Version
# ---------------------------------------------------------------------------

SPEC_VERSION_V1: Final[str] = "aid1"
SPEC_VERSION_V2: Final[str] = "aid2"
SPEC_VERSION: Final[str] = "${constants.specVersion}"
SUPPORTED_SPEC_VERSIONS: Final[List[str]] = [
${supportedSpecVersions.map((version) => `    "${version}",`).join('\n')}
]

# Version-specific raw record metadata. AidRecordV2 excludes legacy DNS kid/i.
AID_RECORD_V1_CANONICAL_FIELDS: Final[List[str]] = ${pyList(recordContract.v1CanonicalFields)}
AID_RECORD_V1_ALIAS_FIELDS: Final[List[str]] = ${pyList(recordContract.v1AliasFields)}
AID_RECORD_V2_CANONICAL_FIELDS: Final[List[str]] = ${pyList(recordContract.v2CanonicalFields)}
AID_RECORD_V2_ALIAS_FIELDS: Final[List[str]] = ${pyList(recordContract.v2AliasFields)}

# ---------------------------------------------------------------------------
# Protocol tokens
# ---------------------------------------------------------------------------
${sortedProtocolTokens
  .map((token) => `PROTO_${token.toUpperCase()}: Final[str] = "${token}"`)
  .join('\n')}

PROTOCOL_TOKENS: Final[Dict[str, str]] = {
${sortedProtocolTokens.map((token) => `    "${token}": "${token}",`).join('\n')}
}

# ---------------------------------------------------------------------------
# Auth tokens
# ---------------------------------------------------------------------------
${sortedAuthTokens
  .map((token) => `AUTH_${token.toUpperCase()}: Final[str] = "${token}"`)
  .join('\n')}

AUTH_TOKENS: Final[Dict[str, str]] = {
${sortedAuthTokens.map((token) => `    "${token}": "${token}",`).join('\n')}
}

# ---------------------------------------------------------------------------
# Error codes & messages
# ---------------------------------------------------------------------------
${sortedErrorCodes
  .map(
    (errorName) => `
${errorName}: Final[int] = ${constants.errorCodes[errorName].code}`,
  )
  .join('')}

ERROR_CODES: Final[Dict[str, int]] = {
${sortedErrorCodes.map((errorName) => `    "${errorName}": ${errorName},`).join('\n')}
}

ERROR_MESSAGES: Final[Dict[str, str]] = {
${sortedErrorCodes
  .map(
    (errorName) =>
      `    "${errorName}": "${escapePy(
        constants.errorCodes[errorName].description ??
          constants.errorCodes[errorName].message ??
          '',
      )}",`,
  )
  .join('\n')}
}

# ---------------------------------------------------------------------------
# Other spec constants
# ---------------------------------------------------------------------------

DNS_SUBDOMAIN: Final[str] = "${constants.dns.subdomain}"
DNS_TTL_MIN: Final[int] = ${constants.dns.ttlRecommendation.min}
DNS_TTL_MAX: Final[int] = ${constants.dns.ttlRecommendation.max}

LOCAL_URI_SCHEMES: Final[List[str]] = [
${constants.localUriSchemes.map((scheme) => `    "${scheme}",`).join('\n')}
]
`;
}

function generateGoConstants(constants: ProtocolConstants): string {
  const sortedProtocolTokens = Object.keys(constants.protocolTokens).sort();
  const sortedAuthTokens = Object.keys(constants.authTokens).sort();
  const sortedErrorCodes = Object.keys(constants.errorCodes).sort();
  const supportedSpecVersions =
    constants.supportedSpecVersions && constants.supportedSpecVersions.length > 0
      ? constants.supportedSpecVersions
      : [constants.specVersion];
  const recordContract = getRecordContractMetadata(constants);

  const goWarning = `// Code generated by scripts/generate-constants.ts; DO NOT EDIT.`;

  const toPascalCase = (s: string) =>
    s
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');

  return `${goWarning}

package aid

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

const SpecVersionV1 = "aid1"
const SpecVersionV2 = "aid2"
const SpecVersion = "${constants.specVersion}"

var SupportedSpecVersions = []string{
${supportedSpecVersions.map((version) => `\t"${version}",`).join('\n')}
}

// Version-specific raw record metadata. AidRecordV2 excludes legacy DNS kid/i.
var AidRecordV1CanonicalFields = ${goStringSlice(recordContract.v1CanonicalFields)}
var AidRecordV1AliasFields = ${goStringSlice(recordContract.v1AliasFields)}
var AidRecordV2CanonicalFields = ${goStringSlice(recordContract.v2CanonicalFields)}
var AidRecordV2AliasFields = ${goStringSlice(recordContract.v2AliasFields)}

// ---------------------------------------------------------------------------
// Protocol tokens
// ---------------------------------------------------------------------------
const (
${sortedProtocolTokens
  .map((token) => `\t${toPascalCase(`PROTO_${token}`)} = "${token}"`)
  .join('\n')}
)

// ProtocolTokens maps protocol names to their string representation
var ProtocolTokens = map[string]string{
${sortedProtocolTokens.map((token) => `\t"${token}": "${token}",`).join('\n')}
}

// ---------------------------------------------------------------------------
// Auth tokens
// ---------------------------------------------------------------------------
const (
${sortedAuthTokens.map((token) => `\t${toPascalCase(`AUTH_${token}`)} = "${token}"`).join('\n')}
)

// AuthTokens maps auth token names to their string representation
var AuthTokens = map[string]string{
${sortedAuthTokens.map((token) => `\t"${token}": "${token}",`).join('\n')}
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------
const (
${sortedErrorCodes
  .map((errorName) => `\t${toPascalCase(errorName)} = ${constants.errorCodes[errorName].code}`)
  .join('\n')}
)

// ErrorMessages maps error codes to their human-readable descriptions
var ErrorMessages = map[int]string{
${sortedErrorCodes
  .map(
    (errorName) =>
      `\t${toPascalCase(errorName)}: "${
        constants.errorCodes[errorName].description ?? constants.errorCodes[errorName].message ?? ''
      }",`,
  )
  .join('\n')}
}

// ---------------------------------------------------------------------------
// Other spec constants
// ---------------------------------------------------------------------------

const DnsSubdomain = "${constants.dns.subdomain}"
const DnsTtlMin = ${constants.dns.ttlRecommendation.min}
const DnsTtlMax = ${constants.dns.ttlRecommendation.max}

// LocalURISchemes contains the allowed URI schemes for local protocol
var LocalUriSchemes = []string{
${constants.localUriSchemes.map((scheme) => `\t"${scheme}",`).join('\n')}
}
`;
}

// -----------------------
// Rust generator (aid-rs)
// -----------------------
function generateRustConstants(constants: ProtocolConstants): string {
  const sortedProtocolTokens = Object.keys(constants.protocolTokens).sort();
  const sortedAuthTokens = Object.keys(constants.authTokens).sort();
  const sortedErrorCodes = Object.keys(constants.errorCodes).sort();
  const supportedSpecVersions =
    constants.supportedSpecVersions && constants.supportedSpecVersions.length > 0
      ? constants.supportedSpecVersions
      : [constants.specVersion];
  const recordContract = getRecordContractMetadata(constants);

  return (
    `// GENERATED FILE - DO NOT EDIT\n\n` +
    `// Auto-generated from protocol/constants.yml by scripts/generate-constants.ts\n` +
    `// Run 'pnpm gen' to regenerate.\n\n` +
    `pub const SPEC_VERSION_V1: &str = "aid1";\n` +
    `pub const SPEC_VERSION_V2: &str = "aid2";\n` +
    `pub const SPEC_VERSION: &str = "${constants.specVersion}";\n` +
    `pub const SUPPORTED_SPEC_VERSIONS: &[&str] = &[${supportedSpecVersions
      .map((version) => `"${version}"`)
      .join(', ')}];\n\n` +
    `// Version-specific raw record metadata. AidRecordV2 excludes legacy DNS kid/i.\n` +
    `pub const AID_RECORD_V1_CANONICAL_FIELDS: &[&str] = ${rustStrSlice(recordContract.v1CanonicalFields)};\n` +
    `pub const AID_RECORD_V1_ALIAS_FIELDS: &[&str] = ${rustStrSlice(recordContract.v1AliasFields)};\n` +
    `pub const AID_RECORD_V2_CANONICAL_FIELDS: &[&str] = ${rustStrSlice(recordContract.v2CanonicalFields)};\n` +
    `pub const AID_RECORD_V2_ALIAS_FIELDS: &[&str] = ${rustStrSlice(recordContract.v2AliasFields)};\n\n` +
    `// Protocol tokens\n` +
    sortedProtocolTokens
      .map((t) => `pub const PROTO_${t.toUpperCase()}: &str = "${t}";`)
      .join('\n') +
    `\n\n` +
    `// Auth tokens\n` +
    sortedAuthTokens.map((t) => `pub const AUTH_${t.toUpperCase()}: &str = "${t}";`).join('\n') +
    `\n\n` +
    `// Error codes (numeric codes only; human-readable messages are intentionally omitted\n` +
    `// from Rust/C#/Java constants — use ErrorMessages in Go/Python/TypeScript for display).\n` +
    sortedErrorCodes
      .map((e) => `pub const ${e}: u16 = ${constants.errorCodes[e].code};`)
      .join('\n') +
    `\n\n` +
    `pub const DNS_SUBDOMAIN: &str = "${constants.dns.subdomain}";\n` +
    `pub const DNS_TTL_MIN: u32 = ${constants.dns.ttlRecommendation.min};\n` +
    `pub const DNS_TTL_MAX: u32 = ${constants.dns.ttlRecommendation.max};\n\n` +
    `pub const LOCAL_URI_SCHEMES: &[&str] = &[${constants.localUriSchemes
      .map((s) => `"${s}"`)
      .join(', ')}];\n`
  );
}

// ---------------------------
// .NET generator (aid-dotnet)
// ---------------------------
function generateDotnetConstants(constants: ProtocolConstants): string {
  const sortedProtocolTokens = Object.keys(constants.protocolTokens).sort();
  const sortedAuthTokens = Object.keys(constants.authTokens).sort();
  const sortedErrorCodes = Object.keys(constants.errorCodes).sort();
  const supportedSpecVersions =
    constants.supportedSpecVersions && constants.supportedSpecVersions.length > 0
      ? constants.supportedSpecVersions
      : [constants.specVersion];
  const recordContract = getRecordContractMetadata(constants);

  return (
    `// <auto-generated>\n// GENERATED FILE - DO NOT EDIT\n// </auto-generated>\n\n` +
    `namespace AidDiscovery {\n` +
    `  public static class Constants {\n` +
    `    public const string SpecVersionV1 = "aid1";\n` +
    `    public const string SpecVersionV2 = "aid2";\n` +
    `    public const string SpecVersion = "${constants.specVersion}";\n` +
    `    public static readonly string[] SupportedSpecVersions = new string[] { ${supportedSpecVersions
      .map((version) => `"${version}"`)
      .join(', ')} };\n` +
    `    // Version-specific raw record metadata. AidRecordV2 excludes legacy DNS kid/i.\n` +
    `    public static readonly string[] AidRecordV1CanonicalFields = ${csStringArray(recordContract.v1CanonicalFields)};\n` +
    `    public static readonly string[] AidRecordV1AliasFields = ${csStringArray(recordContract.v1AliasFields)};\n` +
    `    public static readonly string[] AidRecordV2CanonicalFields = ${csStringArray(recordContract.v2CanonicalFields)};\n` +
    `    public static readonly string[] AidRecordV2AliasFields = ${csStringArray(recordContract.v2AliasFields)};\n` +
    sortedProtocolTokens
      .map((t) => `    public const string PROTO_${t.toUpperCase()} = "${t}";`)
      .join('\n') +
    `\n` +
    sortedAuthTokens
      .map((t) => `    public const string AUTH_${t.toUpperCase()} = "${t}";`)
      .join('\n') +
    `\n` +
    `    // Error codes (numeric codes only; human-readable messages are intentionally omitted\n` +
    `    // from C#/Rust/Java constants — use ErrorMessages in Go/Python/TypeScript for display).\n` +
    sortedErrorCodes
      .map((e) => `    public const int ${e} = ${constants.errorCodes[e].code};`)
      .join('\n') +
    `\n` +
    `    public const string DnsSubdomain = "${constants.dns.subdomain}";\n` +
    `    public const int DnsTtlMin = ${constants.dns.ttlRecommendation.min};\n` +
    `    public const int DnsTtlMax = ${constants.dns.ttlRecommendation.max};\n` +
    `    public static readonly string[] LocalUriSchemes = new string[] { ${constants.localUriSchemes
      .map((s) => `"${s}"`)
      .join(', ')} };\n` +
    `  }\n}`
  );
}

// ------------------------
// Java generator (aid-java)
// ------------------------
function generateJavaConstants(constants: ProtocolConstants): string {
  const sortedProtocolTokens = Object.keys(constants.protocolTokens).sort();
  const sortedAuthTokens = Object.keys(constants.authTokens).sort();
  const sortedErrorCodes = Object.keys(constants.errorCodes).sort();
  const supportedSpecVersions =
    constants.supportedSpecVersions && constants.supportedSpecVersions.length > 0
      ? constants.supportedSpecVersions
      : [constants.specVersion];
  const recordContract = getRecordContractMetadata(constants);

  return (
    `// GENERATED FILE - DO NOT EDIT\n` +
    `package org.agentcommunity.aid;\n\n` +
    `public final class Constants {\n` +
    `  private Constants() {}\n` +
    `  public static final String SPEC_VERSION_V1 = "aid1";\n` +
    `  public static final String SPEC_VERSION_V2 = "aid2";\n` +
    `  public static final String SPEC_VERSION = "${constants.specVersion}";\n` +
    `  public static final String[] SUPPORTED_SPEC_VERSIONS = new String[] {${supportedSpecVersions
      .map((version) => `"${version}"`)
      .join(', ')} };\n` +
    `  // Version-specific raw record metadata. AidRecordV2 excludes legacy DNS kid/i.\n` +
    `  public static final String[] AID_RECORD_V1_CANONICAL_FIELDS = ${javaStringArray(recordContract.v1CanonicalFields)};\n` +
    `  public static final String[] AID_RECORD_V1_ALIAS_FIELDS = ${javaStringArray(recordContract.v1AliasFields)};\n` +
    `  public static final String[] AID_RECORD_V2_CANONICAL_FIELDS = ${javaStringArray(recordContract.v2CanonicalFields)};\n` +
    `  public static final String[] AID_RECORD_V2_ALIAS_FIELDS = ${javaStringArray(recordContract.v2AliasFields)};\n` +
    sortedProtocolTokens
      .map((t) => `  public static final String PROTO_${t.toUpperCase()} = "${t}";`)
      .join('\n') +
    `\n` +
    sortedAuthTokens
      .map((t) => `  public static final String AUTH_${t.toUpperCase()} = "${t}";`)
      .join('\n') +
    `\n` +
    `  // Error codes (numeric codes only; human-readable messages are intentionally omitted\n` +
    `  // from Java/Rust/C# constants — use ErrorMessages in Go/Python/TypeScript for display).\n` +
    sortedErrorCodes
      .map((e) => `  public static final int ${e} = ${constants.errorCodes[e].code};`)
      .join('\n') +
    `\n` +
    `  public static final String DNS_SUBDOMAIN = "${constants.dns.subdomain}";\n` +
    `  public static final int DNS_TTL_MIN = ${constants.dns.ttlRecommendation.min};\n` +
    `  public static final int DNS_TTL_MAX = ${constants.dns.ttlRecommendation.max};\n` +
    `  public static final String[] LOCAL_URI_SCHEMES = new String[] {${constants.localUriSchemes
      .map((s) => `"${s}"`)
      .join(', ')} };\n` +
    `}`
  );
}

// --- Top-level script execution ---

try {
  // Read and parse YAML file
  const yamlPath = path.resolve(process.cwd(), 'protocol/constants.yml');
  const yamlContent = readFileSync(yamlPath, 'utf8');
  const constants = parse(yamlContent) as ProtocolConstants;

  // Generate TypeScript constants
  const tsContent = generateTypeScriptConstants(constants);

  // Write to the aid package constants file (formatted with Prettier)
  const tsOutputPath = path.resolve(process.cwd(), 'packages/aid/src/constants.ts');

  // Use project's prettier configuration for consistency
  const prettierOptions = await prettier.resolveConfig(process.cwd());
  let tsFormatted: string;
  try {
    tsFormatted = await prettier.format(tsContent, {
      // Use project's prettier config with explicit fallbacks
      semi: prettierOptions?.semi ?? true,
      singleQuote: prettierOptions?.singleQuote ?? true,
      trailingComma: (prettierOptions?.trailingComma as 'all' | 'es5' | 'none') ?? 'all',
      printWidth: prettierOptions?.printWidth ?? 100,
      parser: 'typescript',
    });
  } catch {
    console.warn('⚠️ Prettier formatting (TS constants) failed. Writing unformatted output.');
    tsFormatted = tsContent;
  }

  writeFileSync(tsOutputPath, tsFormatted);

  console.log('✅ Generated constants.ts from protocol/constants.yml');
  console.log(`   Output: ${tsOutputPath}`);

  // Generate spec module (canonical) next to YAML
  const specModule = generateWebSpecModule(constants);
  const protoDir = path.resolve(process.cwd(), 'protocol');
  const protoSpecPath = path.resolve(protoDir, 'spec.ts');
  mkdirSync(protoDir, { recursive: true });
  let specFormatted: string;
  try {
    specFormatted = await prettier.format(specModule, {
      semi: prettierOptions?.semi ?? true,
      singleQuote: prettierOptions?.singleQuote ?? true,
      trailingComma: (prettierOptions?.trailingComma as 'all' | 'es5' | 'none') ?? 'all',
      printWidth: prettierOptions?.printWidth ?? 100,
      parser: 'typescript',
    });
  } catch {
    console.warn('⚠️ Prettier formatting (protocol spec.ts) failed. Writing unformatted output.');
    specFormatted = specModule;
  }
  writeFileSync(protoSpecPath, specFormatted);
  console.log('✅ Generated protocol/spec.ts from protocol/constants.yml');
  console.log(`   Output: ${protoSpecPath}`);

  // Back-compat: also write a mirrored copy for the Web app
  const webSpecDir = path.resolve(process.cwd(), 'packages/web/src/generated');
  const webSpecPath = path.resolve(webSpecDir, 'spec.ts');
  mkdirSync(webSpecDir, { recursive: true });
  writeFileSync(webSpecPath, specFormatted);
  console.log('✅ Mirrored spec.ts for Web (back-compat)');
  console.log(`   Output: ${webSpecPath}`);

  // Generate Python constants
  const pyContent = generatePythonConstants(constants);
  const pyOutputPath = path.resolve(process.cwd(), 'packages/aid-py/aid_py/constants.py');

  writeFileSync(pyOutputPath, pyContent);
  console.log('✅ Generated constants.py from protocol/constants.yml');
  console.log(`   Output: ${pyOutputPath}`);

  // Generate Go constants
  const goContent = generateGoConstants(constants);
  const goOutputPath = path.resolve(process.cwd(), 'packages/aid-go/constants_gen.go');

  writeFileSync(goOutputPath, goContent);

  // Format Go code using gofmt
  try {
    execSync(`gofmt -w "${goOutputPath}"`, { stdio: 'pipe' });
    console.log('✅ Generated constants_gen.go from protocol/constants.yml');
    console.log(`   Output: ${goOutputPath}`);
  } catch (gofmtError) {
    console.warn('⚠️  Generated Go constants but gofmt failed:', gofmtError);
    console.log('✅ Generated constants_gen.go from protocol/constants.yml (unformatted)');
    console.log(`   Output: ${goOutputPath}`);
  }

  // Generate Rust constants (if crate path exists)
  try {
    const rsDir = path.resolve(process.cwd(), 'packages/aid-rs/src');
    if (existsSync(rsDir)) {
      const rsContent = generateRustConstants(constants);
      const rsOutputPath = path.resolve(rsDir, 'constants_gen.rs');
      writeFileSync(rsOutputPath, rsContent);
      try {
        execSync(`rustfmt "${rsOutputPath}"`, { stdio: 'pipe' });
      } catch {
        // ignore formatter errors in environments without rustfmt
      }
      console.log('✅ Generated constants_gen.rs from protocol/constants.yml');
      console.log(`   Output: ${rsOutputPath}`);
    } else {
      console.warn('ℹ️ Skipped Rust generation (packages/aid-rs not present).');
    }
  } catch (e) {
    console.warn('ℹ️ Skipped Rust generation due to error.', e);
  }

  // Generate .NET constants (if project path exists)
  try {
    const csDir = path.resolve(process.cwd(), 'packages/aid-dotnet/src');
    if (existsSync(csDir)) {
      const csContent = generateDotnetConstants(constants);
      const csOutputPath = path.resolve(csDir, 'Constants.g.cs');
      writeFileSync(csOutputPath, csContent);
      console.log('✅ Generated Constants.g.cs from protocol/constants.yml');
      console.log(`   Output: ${csOutputPath}`);
    } else {
      console.warn('ℹ️ Skipped .NET generation (packages/aid-dotnet not present).');
    }
  } catch (e) {
    console.warn('ℹ️ Skipped .NET generation due to error.', e);
  }

  // Generate Java constants (if package path exists)
  try {
    const javaDir = path.resolve(
      process.cwd(),
      'packages/aid-java/src/main/java/org/agentcommunity/aid',
    );
    if (existsSync(javaDir)) {
      const javaContent = generateJavaConstants(constants);
      const javaOutputPath = path.resolve(javaDir, 'Constants.java');
      // Ensure directory exists in case path partially exists
      mkdirSync(javaDir, { recursive: true });
      writeFileSync(javaOutputPath, javaContent);
      console.log('✅ Generated Constants.java from protocol/constants.yml');
      console.log(`   Output: ${javaOutputPath}`);
    } else {
      console.warn('ℹ️ Skipped Java generation (packages/aid-java not present).');
    }
  } catch (e) {
    console.warn('ℹ️ Skipped Java generation due to error.', e);
  }
} catch (error) {
  console.error('❌ Failed to generate constants:', error);
  process.exit(1);
}
