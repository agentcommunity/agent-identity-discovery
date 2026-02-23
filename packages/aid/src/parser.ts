import {
  type AidRecord,
  type RawAidRecord,
  type ErrorCode,
  SPEC_VERSION,
  PROTOCOL_TOKENS,
  AUTH_TOKENS,
  ERROR_MESSAGES,
  ERROR_CODES,
  LOCAL_URI_SCHEMES,
} from './constants.js';

/**
 * Custom error class for AID parsing and validation errors
 */
export class AidError extends Error {
  public readonly code: number;
  public readonly errorCode: ErrorCode;
  public readonly details?: Record<string, unknown> | undefined;

  constructor(errorCode: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message || ERROR_MESSAGES[errorCode]);
    this.name = 'AidError';
    this.code = ERROR_CODES[errorCode];
    this.errorCode = errorCode;
    this.details = details;
  }
}

/**
 * Build a canonical RawAidRecord from JSON that may include alias keys
 * This is used for `.well-known` discovery where the source is JSON, not a TXT record.
 */
export function canonicalizeRaw(json: Record<string, unknown>): RawAidRecord {
  const out: RawAidRecord = {};
  const getStr = (k: string) =>
    typeof json[k] === 'string' ? (json[k] as string).trim() : undefined;
  // Only set fields when defined to comply with exactOptionalPropertyTypes
  // Canonical wire key is `v`, but we still accept `version` for backward compatibility.
  const v = getStr('v') ?? getStr('version');
  if (v !== undefined) out.v = v;
  const uri = getStr('uri') ?? getStr('u');
  if (uri !== undefined) out.uri = uri;
  const proto = getStr('proto') ?? getStr('p');
  if (proto !== undefined) out.proto = proto;
  const auth = getStr('auth') ?? getStr('a');
  if (auth !== undefined) out.auth = auth;
  const desc = getStr('desc') ?? getStr('s');
  if (desc !== undefined) out.desc = desc;
  const docs = getStr('docs') ?? getStr('d');
  if (docs !== undefined) out.docs = docs;
  const dep = getStr('dep') ?? getStr('e');
  if (dep !== undefined) out.dep = dep;
  const pka = getStr('pka') ?? getStr('k');
  if (pka !== undefined) out.pka = pka;
  const kid = getStr('kid') ?? getStr('i');
  if (kid !== undefined) out.kid = kid;
  return out;
}

/**
 * Parse a TXT record string into key-value pairs
 *
 * @param txtRecord - The TXT record string (semicolon-delimited key=value pairs)
 * @returns Raw parsed record object
 */
export function parseRawRecord(txtRecord: string): RawAidRecord {
  const record: RawAidRecord = {};
  // Track if alias form has been seen to enforce alias+full duplication
  let sawU = false;
  let sawA = false;
  let sawS = false;
  let sawD = false;
  let sawE = false;
  let sawK = false;
  let sawI = false;
  let sawP = false;
  let sawV = false;

  // Split by semicolon and process each pair
  const pairs = txtRecord
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean);

  for (const pair of pairs) {
    const equalIndex = pair.indexOf('=');
    if (equalIndex === -1) {
      throw new AidError('ERR_INVALID_TXT', `Invalid key-value pair: ${pair}`);
    }

    const key = pair.slice(0, equalIndex).trim().toLowerCase();
    const value = pair.slice(equalIndex + 1).trim();

    if (!key || !value) {
      throw new AidError('ERR_INVALID_TXT', `Empty key or value in pair: ${pair}`);
    }

    if (key in record) {
      if (key === 'v' && sawV) {
        throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "version" and "v" fields');
      }
      throw new AidError('ERR_INVALID_TXT', `Duplicate key: ${key}`);
    }

    // Handle known keys (case-insensitive)
    switch (key) {
      case 'v':
        if (sawV)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "version" and "v" fields');
        record.v = value;
        break;
      case 'version':
        if (record.v)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "version" and "v" fields');
        sawV = true;
        record.v = value;
        break;
      case 'uri':
        if (sawU) throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "uri" and "u" fields');
        record.uri = value;
        break;
      case 'u':
        if (record.uri)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "uri" and "u" fields');
        sawU = true;
        record.uri = value;
        break;
      case 'proto':
        if (sawP)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "proto" and "p" fields');
        record.proto = value;
        break;
      case 'p':
        if (record.proto)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "proto" and "p" fields');
        sawP = true;
        record.proto = value;
        break;
      case 'auth':
        if (sawA)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "auth" and "a" fields');
        record.auth = value;
        break;
      case 'a':
        if (record.auth)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "auth" and "a" fields');
        sawA = true;
        record.auth = value;
        break;
      case 'desc':
        if (sawS)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "desc" and "s" fields');
        record.desc = value;
        break;
      case 's':
        if (record.desc)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "desc" and "s" fields');
        sawS = true;
        record.desc = value;
        break;
      case 'docs':
        if (sawD)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "docs" and "d" fields');
        record.docs = value;
        break;
      case 'd':
        if (record.docs)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "docs" and "d" fields');
        sawD = true;
        record.docs = value;
        break;
      case 'dep':
        if (sawE) throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "dep" and "e" fields');
        record.dep = value;
        break;
      case 'e':
        if (record.dep)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "dep" and "e" fields');
        sawE = true;
        record.dep = value;
        break;
      case 'pka':
        if (sawK) throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "pka" and "k" fields');
        record.pka = value;
        break;
      case 'k':
        if (record.pka)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "pka" and "k" fields');
        sawK = true;
        record.pka = value;
        break;
      case 'kid':
        if (sawI) throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "kid" and "i" fields');
        record.kid = value;
        break;
      case 'i':
        if (record.kid)
          throw new AidError('ERR_INVALID_TXT', 'Cannot specify both "kid" and "i" fields');
        sawI = true;
        record.kid = value;
        break;
      default:
        // Ignore unknown keys for forward compatibility
        break;
    }
  }

  return record;
}

/**
 * Validate a raw AID record and return a properly typed record
 *
 * @param rawRecord - The raw parsed record
 * @returns Validated AID record
 * @throws AidError if validation fails
 */
export function validateRecord(rawRecord: RawAidRecord): AidRecord {
  // Disallow alias + full-key duplicates per spec
  // Duplicates between alias and full were handled during parsing

  // Check required fields
  if (!rawRecord.v) {
    throw new AidError('ERR_INVALID_TXT', 'Missing required field: v');
  }

  if (!rawRecord.uri) {
    throw new AidError('ERR_INVALID_TXT', 'Missing required field: uri');
  }

  // Check protocol presence (either 'proto' or 'p')
  if (!rawRecord.proto) {
    throw new AidError('ERR_INVALID_TXT', 'Missing required field: proto (or p)');
  }

  // Validate version
  if (rawRecord.v !== SPEC_VERSION) {
    throw new AidError(
      'ERR_INVALID_TXT',
      `Unsupported version: ${rawRecord.v}. Expected: ${SPEC_VERSION}`,
    );
  }

  // Get protocol value (prefer 'proto' over 'p')
  const protoValue = rawRecord.proto;
  if (!protoValue) {
    throw new AidError('ERR_INVALID_TXT', 'Missing protocol value');
  }

  // Validate protocol token
  if (!(protoValue in PROTOCOL_TOKENS)) {
    throw new AidError('ERR_UNSUPPORTED_PROTO', `Unsupported protocol: ${protoValue}`);
  }

  // Validate auth token if present
  if (rawRecord.auth && !(rawRecord.auth in AUTH_TOKENS)) {
    throw new AidError('ERR_INVALID_TXT', `Invalid auth token: ${rawRecord.auth}`);
  }

  // Validate description length (≤ 60 UTF-8 bytes)
  if (rawRecord.desc && new TextEncoder().encode(rawRecord.desc).length > 60) {
    throw new AidError('ERR_INVALID_TXT', 'Description field must be ≤ 60 UTF-8 bytes');
  }

  // Validate metadata keys (basic format checks)
  if (rawRecord.docs) {
    if (!rawRecord.docs.startsWith('https://')) {
      throw new AidError('ERR_INVALID_TXT', 'docs MUST be an absolute https:// URL');
    }
    try {
      new URL(rawRecord.docs);
    } catch {
      throw new AidError('ERR_INVALID_TXT', `Invalid docs URL: ${rawRecord.docs}`);
    }
  }

  if (rawRecord.dep) {
    // Rudimentary ISO 8601 check: Date parse must not be NaN and must end with Z
    if (!/Z$/.test(rawRecord.dep) || Number.isNaN(Date.parse(rawRecord.dep))) {
      throw new AidError(
        'ERR_INVALID_TXT',
        'dep MUST be an ISO 8601 UTC timestamp (e.g., 2026-01-01T00:00:00Z)',
      );
    }
  }

  // If PKA is present, kid is required for rotation
  if (rawRecord.pka && !rawRecord.kid) {
    throw new AidError('ERR_INVALID_TXT', 'kid is required when pka is present');
  }

  // URI validation based on protocol type
  if (protoValue === 'local') {
    // Local protocols MUST use a supported local scheme
    if (!isValidLocalUri(rawRecord.uri)) {
      throw new AidError(
        'ERR_INVALID_TXT',
        `Invalid URI scheme for local protocol. Must be one of: ${LOCAL_URI_SCHEMES.join(', ')}`,
      );
    }
  } else if (protoValue === 'zeroconf') {
    // Zeroconf requires zeroconf: scheme
    if (!rawRecord.uri.startsWith('zeroconf:')) {
      throw new AidError(
        'ERR_INVALID_TXT',
        `Invalid URI scheme for 'zeroconf'. MUST be 'zeroconf:'.`,
      );
    }
  } else if (protoValue === 'websocket') {
    // WebSocket requires wss://
    if (!rawRecord.uri.startsWith('wss://')) {
      throw new AidError('ERR_INVALID_TXT', `Invalid URI scheme for 'websocket'. MUST be 'wss:'.`);
    }
    try {
      new URL(rawRecord.uri);
    } catch {
      throw new AidError('ERR_INVALID_TXT', `Invalid URI format: ${rawRecord.uri}`);
    }
  } else {
    // Remote protocols MUST use https://
    if (!rawRecord.uri.startsWith('https://')) {
      throw new AidError(
        'ERR_INVALID_TXT',
        `Invalid URI scheme for remote protocol '${protoValue}'. MUST be 'https:'.`,
      );
    }
    // And it must be a valid URL
    try {
      new URL(rawRecord.uri);
    } catch {
      throw new AidError('ERR_INVALID_TXT', `Invalid URI format: ${rawRecord.uri}`);
    }
  }

  // Return validated record
  return {
    v: rawRecord.v as 'aid1',
    uri: rawRecord.uri,
    proto: protoValue as keyof typeof PROTOCOL_TOKENS,
    ...(rawRecord.auth && { auth: rawRecord.auth as keyof typeof AUTH_TOKENS }),
    ...(rawRecord.desc && { desc: rawRecord.desc }),
    ...(rawRecord.docs && { docs: rawRecord.docs }),
    ...(rawRecord.dep && { dep: rawRecord.dep }),
    ...(rawRecord.pka && { pka: rawRecord.pka }),
    ...(rawRecord.kid && { kid: rawRecord.kid }),
  };
}

/**
 * Parse and validate a TXT record string
 *
 * @param txtRecord - The TXT record string
 * @returns Validated AID record
 * @throws AidError if parsing or validation fails
 */
export function parse(txtRecord: string): AidRecord {
  const rawRecord = parseRawRecord(txtRecord);
  return validateRecord(rawRecord);
}

/**
 * Check if a protocol token is valid
 *
 * @param token - The protocol token to check
 * @returns True if the token is valid
 */
export function isValidProto(token: string): boolean {
  return token in PROTOCOL_TOKENS;
}

/**
 * Validate URI for local protocol
 *
 * @param uri - The URI to validate for local protocol
 * @returns True if the URI scheme is allowed for local protocol
 */
function isValidLocalUri(uri: string): boolean {
  // Parse URI scheme manually since URL constructor doesn't support custom schemes
  const colonIndex = uri.indexOf(':');
  if (colonIndex === -1) {
    return false;
  }

  const scheme = uri.slice(0, colonIndex);
  return (LOCAL_URI_SCHEMES as readonly string[]).includes(scheme);
}

/**
 * Static validation methods for AidRecord
 */
export const AidRecordValidator = {
  /**
   * Validate a raw object as an AID record
   *
   * @param obj - Object to validate
   * @returns Validated AID record
   * @throws AidError if validation fails
   */
  validate: (obj: unknown): AidRecord => {
    if (typeof obj !== 'object' || obj === null) {
      throw new AidError('ERR_INVALID_TXT', 'Record must be an object');
    }

    return validateRecord(obj as RawAidRecord);
  },

  /**
   * Parse a TXT record string into an AID record
   *
   * @param txtRecord - The TXT record string
   * @returns Validated AID record
   * @throws AidError if parsing fails
   */
  parse: (txtRecord: string): AidRecord => {
    return parse(txtRecord);
  },
};
