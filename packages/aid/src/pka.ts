import { AidError } from './parser.js';

// Lazy Node.js imports – available in Node, absent in browsers.
let nodeWebcrypto: unknown;
let nodeTimingSafeEqual: ((a: Uint8Array, b: Uint8Array) => boolean) | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('node:crypto');
  nodeWebcrypto = nodeCrypto.webcrypto;
  nodeTimingSafeEqual = nodeCrypto.timingSafeEqual;
} catch {
  // Browser – node:crypto not available.
}

// ── Portable base64 helpers (no Buffer dependency) ──────────────────────

function uint8ToBase64Url(bytes: Uint8Array): string {
  // Use btoa which works in both Node 16+ and browsers
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToUint8(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.includes('=')) {
    throw new AidError('ERR_SECURITY', 'Invalid aid2 PKA encoding');
  }
  const remainder = value.length % 4;
  if (remainder === 1) {
    throw new AidError('ERR_SECURITY', 'Invalid aid2 PKA encoding');
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - remainder) % 4);
  return base64ToUint8(padded);
}

// ── Timing-safe comparison ──────────────────────────────────────────────

// Type-safe interface for global crypto with timingSafeEqual
interface CryptoWithTimingSafeEqual {
  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
}

function timingSafeEqual(a: string | Uint8Array, b: string | Uint8Array): boolean {
  const enc = new TextEncoder();
  const aBytes = typeof a === 'string' ? enc.encode(a) : a;
  const bBytes = typeof b === 'string' ? enc.encode(b) : b;

  // Prefer native timingSafeEqual when available (Node.js crypto or Deno)
  const globalCrypto = (globalThis as unknown as { crypto?: CryptoWithTimingSafeEqual }).crypto;
  if (typeof globalCrypto?.timingSafeEqual === 'function') {
    if (aBytes.length !== bBytes.length) return false;
    return globalCrypto.timingSafeEqual(aBytes, bBytes);
  }
  if (typeof nodeTimingSafeEqual === 'function') {
    if (aBytes.length !== bBytes.length) {
      nodeTimingSafeEqual(bBytes, bBytes); // constant-time filler
      return false;
    }
    return nodeTimingSafeEqual(aBytes, bBytes);
  }

  // Browser fallback – constant-time XOR compare
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

function asciiLowerCase(s: string): string {
  let res = '';
  for (let i = 0; i < s.length; i++) {
    const charCode = s.charCodeAt(i);
    // ASCII 'A' is 65, 'Z' is 90
    if (charCode >= 65 && charCode <= 90) {
      res += String.fromCharCode(charCode + 32);
    } else {
      res += s[i];
    }
  }
  return res;
}

export interface PKAHandshakeResult {
  /** True when the endpoint signed the AID-Domain binding for the queried domain. */
  domainBound: boolean;
}

export const AID_DOMAIN_HEADER = 'AID-Domain';
const AID_PKA_TAG_V2 = 'aid-pka-v2';
const AID_PKA_TAG_V2_DB = 'aid-pka-v2-db';

export function canonicalizeAidDomain(domain: string): string {
  let value = asciiLowerCase(domain.trim());
  if (value.endsWith('.')) value = value.slice(0, -1);
  if (!value || !/^[a-z0-9.:[\]_-]+$/.test(value)) {
    throw new AidError('ERR_SECURITY', 'Invalid AID-Domain value');
  }
  return value;
}

// Minimal types to avoid DOM deps
interface HeaderLike {
  get(name: string): string | null | undefined;
}

interface SubtleLike {
  importKey: (
    format: 'raw',
    keyData: ArrayBuffer | Uint8Array,
    algorithm: { name: 'Ed25519' },
    extractable: false,
    keyUsages: ['verify'],
  ) => Promise<unknown>;
  verify: (
    algorithm: 'Ed25519',
    key: unknown,
    signature: ArrayBufferView,
    data: ArrayBufferView,
  ) => Promise<boolean>;
  digest: (algorithm: 'SHA-256', data: ArrayBufferView) => Promise<ArrayBuffer>;
}

interface CryptoLike {
  getRandomValues: (array: Uint8Array) => Uint8Array;
  subtle: SubtleLike;
}

interface FetchResponse {
  ok: boolean;
  status: number;
  headers: HeaderLike;
  text(): Promise<string>;
}

type FetchLike = (
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    redirect?: 'error' | 'follow' | 'manual';
    signal?: AbortSignal;
  },
) => Promise<FetchResponse>;

// Base58btc alphabet
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP = new Map<string, number>(Array.from(B58).map((c, i) => [c, i]));

function base58Decode(s: string): Uint8Array {
  if (!s) return new Uint8Array();
  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;
  const size = (((s.length - zeros) * Math.log(58)) / Math.log(256) + 1) | 0;
  const b = new Uint8Array(size);
  for (let i = zeros; i < s.length; i++) {
    const c = s[i];
    const val = B58_MAP.get(c);
    if (val === undefined) throw new AidError('ERR_SECURITY', 'Invalid base58 character');
    let carry = val;
    for (let j = size - 1; j >= 0; j--) {
      carry += 58 * b[j];
      b[j] = carry & 0xff;
      carry >>= 8;
    }
  }
  // Skip leading zeros in b
  let it = 0;
  while (it < b.length && b[it] === 0) it++;
  const out = new Uint8Array(zeros + (b.length - it));
  out.fill(0, 0, zeros);
  out.set(b.subarray(it), zeros);
  return out;
}

function multibaseDecode(input: string): Uint8Array {
  if (!input) throw new AidError('ERR_SECURITY', 'Empty PKA');
  const prefix = input[0];
  const payload = input.slice(1);
  if (prefix === 'z') {
    return base58Decode(payload);
  }
  throw new AidError('ERR_SECURITY', 'Unsupported multibase prefix');
}

function parseV1SignatureHeaders(headers: HeaderLike): {
  covered: string[];
  created: number;
  keyid: string; // normalized (no quotes)
  keyidRaw: string; // as present in Signature-Input (may include quotes)
  alg: string;
  signature: Uint8Array;
  responseDate: string | null;
} {
  const sigInput = headers.get('Signature-Input') || headers.get('signature-input');
  const sig = headers.get('Signature') || headers.get('signature');
  if (!sigInput || !sig) throw new AidError('ERR_SECURITY', 'Missing signature headers');

  // Extract covered fields inside parentheses after sig=(...)
  const inside = /sig=\(\s*([^)]*?)\s*\)/i.exec(sigInput);
  if (!inside) throw new AidError('ERR_SECURITY', 'Invalid Signature-Input');
  const covered: string[] = [];
  const tokenRe = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(inside[1])) !== null) covered.push(m[1]);
  if (covered.length === 0) throw new AidError('ERR_SECURITY', 'Invalid Signature-Input');
  const required = ['aid-challenge', '@method', '@target-uri', 'host', 'date'];

  if (covered.length !== required.length) {
    throw new AidError('ERR_SECURITY', 'Signature-Input must cover required fields');
  }

  const coveredLower = covered.map(asciiLowerCase).sort();
  const requiredSorted = [...required].sort();

  let areEqual = true;
  for (let i = 0; i < requiredSorted.length; i++) {
    if (!timingSafeEqual(coveredLower[i], requiredSorted[i])) {
      areEqual = false;
      // Do not break early
    }
  }
  if (!areEqual) {
    throw new AidError('ERR_SECURITY', 'Signature-Input must cover required fields');
  }

  // Extract parameters regardless of order
  const createdMatch = /(?:^|;)\s*created=(\d+)/i.exec(sigInput);
  const keyidMatch = /(?:^|;)\s*keyid=([^;\s]+)/i.exec(sigInput);
  const algMatch = /(?:^|;)\s*alg="([^"]+)"/i.exec(sigInput);
  if (!createdMatch || !keyidMatch || !algMatch)
    throw new AidError('ERR_SECURITY', 'Invalid Signature-Input');
  const created = Number.parseInt(createdMatch[1], 10);
  const keyidRaw = keyidMatch[1];
  const keyid = keyidRaw.replace(/^"(.+)"$/, '$1');
  const alg = asciiLowerCase(algMatch[1]);

  // Extract signature value from Signature header
  const sigMatch = /sig\s*=\s*:\s*([^:]+)\s*:/i.exec(sig);
  if (!sigMatch) throw new AidError('ERR_SECURITY', 'Invalid Signature header');
  const signature = base64ToUint8(sigMatch[1]);
  const responseDate = (headers.get('Date') || headers.get('date') || null) as string | null;
  return { covered, created, keyid, keyidRaw, alg, signature, responseDate };
}

function buildV1SignatureBase(
  covered: string[],
  params: { created: number; keyid: string; alg: string },
  ctx: {
    method: string;
    targetUri: string;
    host: string;
    date: string;
    challenge: string;
  },
): Uint8Array {
  const lines: string[] = [];
  for (const item of covered) {
    const lower = asciiLowerCase(item);
    let appended = false;
    if (timingSafeEqual(lower, 'aid-challenge')) {
      lines.push(`"AID-Challenge": ${ctx.challenge}`);
      appended = true;
    }
    if (timingSafeEqual(lower, '@method')) {
      lines.push(`"@method": ${ctx.method}`);
      appended = true;
    }
    if (timingSafeEqual(lower, '@target-uri')) {
      lines.push(`"@target-uri": ${ctx.targetUri}`);
      appended = true;
    }
    if (timingSafeEqual(lower, 'host')) {
      lines.push(`"host": ${ctx.host}`);
      appended = true;
    }
    if (timingSafeEqual(lower, 'date')) {
      lines.push(`"date": ${ctx.date}`);
      appended = true;
    }
    if (!appended) {
      throw new AidError('ERR_SECURITY', `Unsupported covered field: ${item}`);
    }
  }
  const quoted = covered.map((c) => `"${c}"`).join(' ');
  const paramsStr = `(${quoted});created=${params.created};keyid=${params.keyid};alg="${params.alg}"`;
  lines.push(`"@signature-params": ${paramsStr}`);
  return new TextEncoder().encode(lines.join('\n'));
}

function splitDictionaryMembers(input: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let inString = false;
  let escaped = false;
  let depth = 0;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '(') depth++;
    if (char === ')') depth--;
    if (char === ',' && depth === 0) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }

  parts.push(input.slice(start).trim());
  return parts.filter(Boolean);
}

function extractDictionaryMember(input: string, label: string): string {
  let found: string | undefined;
  const expectedLabel = asciiLowerCase(label);
  for (const part of splitDictionaryMembers(input)) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const memberLabel = part.slice(0, eq).trim();
    if (asciiLowerCase(memberLabel) === expectedLabel) {
      if (memberLabel !== label || found !== undefined) {
        throw new AidError('ERR_SECURITY', `Duplicate ${label} signature member`);
      }
      found = part.slice(eq + 1).trim();
    }
  }
  if (found !== undefined) return found;
  throw new AidError('ERR_SECURITY', `Missing ${label} signature member`);
}

function splitInnerListItems(input: string): string[] {
  const items: string[] = [];
  let start = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (/\s/.test(char)) {
      const item = input.slice(start, i).trim();
      if (item) items.push(item);
      start = i + 1;
    }
  }

  const tail = input.slice(start).trim();
  if (tail) items.push(tail);
  return items;
}

function unquoteSfString(value: string): string {
  if (!value.startsWith('"') || !value.endsWith('"')) return value;
  let out = '';
  for (let i = 1; i < value.length - 1; i++) {
    const char = value[i];
    if (char === '\\' && i + 1 < value.length - 1) {
      i++;
      out += value[i];
    } else {
      out += char;
    }
  }
  return out;
}

function parseSignatureParams(
  raw: string,
): Map<string, { rawValue: string; value: string | true }> {
  const params = new Map<string, { rawValue: string; value: string | true }>();
  const allowedParams = new Set(['nonce', 'keyid', 'alg', 'created', 'expires', 'tag']);
  let i = 0;

  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (i >= raw.length) break;
    if (raw[i] !== ';') throw new AidError('ERR_SECURITY', 'Invalid Signature-Input parameters');
    i++;
    while (i < raw.length && /\s/.test(raw[i])) i++;
    const nameStart = i;
    while (i < raw.length && /[A-Za-z0-9_*.-]/.test(raw[i])) i++;
    const name = raw.slice(nameStart, i);
    if (!name) throw new AidError('ERR_SECURITY', 'Invalid Signature-Input parameter');
    if (!allowedParams.has(name)) {
      throw new AidError('ERR_SECURITY', `Unsupported Signature-Input parameter: ${name}`);
    }
    if (params.has(name)) {
      throw new AidError('ERR_SECURITY', `Duplicate Signature-Input parameter: ${name}`);
    }
    while (i < raw.length && /\s/.test(raw[i])) i++;

    if (raw[i] !== '=') {
      params.set(name, { rawValue: '', value: true });
      continue;
    }

    i++;
    while (i < raw.length && /\s/.test(raw[i])) i++;
    const valueStart = i;
    if (raw[i] === '"') {
      i++;
      let escaped = false;
      while (i < raw.length) {
        const char = raw[i];
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          i++;
          break;
        }
        i++;
      }
    } else {
      while (i < raw.length && raw[i] !== ';') i++;
    }

    const rawValue = raw.slice(valueStart, i).trim();
    params.set(name, { rawValue, value: unquoteSfString(rawValue) });
  }

  return params;
}

interface V2CoveredItem {
  raw: string;
  name: '@method' | '@target-uri' | '@authority' | '@status' | 'aid-domain';
  req: boolean;
}

interface V2SignatureHeaders {
  covered: V2CoveredItem[];
  signatureParamsRaw: string;
  created: number;
  expires: number;
  keyid: string;
  alg: string;
  nonce: string;
  tag: string;
  signature: Uint8Array;
}

function parseV2CoveredItem(raw: string): V2CoveredItem {
  const match = /^"([^"]+)"((?:;[A-Za-z0-9_*.-]+)*)$/.exec(raw);
  if (!match) throw new AidError('ERR_SECURITY', 'Invalid Signature-Input covered item');
  const name = match[1] as V2CoveredItem['name'];
  const params = match[2] ? match[2].split(';').filter(Boolean) : [];

  if (!['@method', '@target-uri', '@authority', '@status', 'aid-domain'].includes(name)) {
    throw new AidError('ERR_SECURITY', `Unsupported covered field: ${name}`);
  }
  const reqCount = params.filter((param) => param === 'req').length;
  if (reqCount > 1 || params.some((param) => param !== 'req')) {
    throw new AidError('ERR_SECURITY', 'Invalid Signature-Input covered item');
  }

  return { raw, name, req: reqCount === 1 };
}

function validateV2CoveredSet(covered: V2CoveredItem[], domainBound: boolean): void {
  const expected = new Map<V2CoveredItem['name'], boolean>([
    ['@method', true],
    ['@target-uri', true],
    ['@authority', true],
    ['@status', false],
  ]);
  if (domainBound) expected.set('aid-domain', true);

  if (covered.length !== expected.size) {
    throw new AidError('ERR_SECURITY', 'Signature-Input must cover required fields');
  }

  const seen = new Set<string>();
  for (const item of covered) {
    if (seen.has(item.name) || expected.get(item.name) !== item.req) {
      throw new AidError('ERR_SECURITY', 'Signature-Input must cover required fields');
    }
    seen.add(item.name);
  }

  if (seen.size !== expected.size) {
    throw new AidError('ERR_SECURITY', 'Signature-Input must cover required fields');
  }
}

function parseV2SignatureHeaders(headers: HeaderLike): V2SignatureHeaders {
  const sigInput = headers.get('Signature-Input') || headers.get('signature-input');
  const sig = headers.get('Signature') || headers.get('signature');
  if (!sigInput || !sig) throw new AidError('ERR_SECURITY', 'Missing signature headers');

  const signatureParamsRaw = extractDictionaryMember(sigInput, 'aid-pka');
  if (!signatureParamsRaw.startsWith('('))
    throw new AidError('ERR_SECURITY', 'Invalid Signature-Input');
  const closeIndex = signatureParamsRaw.indexOf(')');
  if (closeIndex < 0) throw new AidError('ERR_SECURITY', 'Invalid Signature-Input');

  const coveredRaw = signatureParamsRaw.slice(1, closeIndex).trim();
  const paramsRaw = signatureParamsRaw.slice(closeIndex + 1);
  const covered = splitInnerListItems(coveredRaw).map(parseV2CoveredItem);

  const params = parseSignatureParams(paramsRaw);
  const createdRaw = params.get('created')?.rawValue;
  const expiresRaw = params.get('expires')?.rawValue;
  const keyid = params.get('keyid')?.value;
  const alg = params.get('alg')?.value;
  const nonce = params.get('nonce')?.value;
  const tag = params.get('tag')?.value;
  if (
    typeof createdRaw !== 'string' ||
    typeof expiresRaw !== 'string' ||
    typeof keyid !== 'string' ||
    typeof alg !== 'string' ||
    typeof nonce !== 'string' ||
    typeof tag !== 'string'
  ) {
    throw new AidError('ERR_SECURITY', 'Invalid Signature-Input');
  }
  if (!/^\d+$/.test(createdRaw) || !/^\d+$/.test(expiresRaw)) {
    throw new AidError('ERR_SECURITY', 'Invalid Signature-Input timestamp');
  }

  validateV2CoveredSet(covered, tag === AID_PKA_TAG_V2_DB);

  const signatureRaw = extractDictionaryMember(sig, 'aid-pka');
  const sigMatch = /^:\s*([^:]+?)\s*:$/.exec(signatureRaw);
  if (!sigMatch) throw new AidError('ERR_SECURITY', 'Invalid Signature header');

  return {
    covered,
    signatureParamsRaw,
    created: Number.parseInt(createdRaw, 10),
    expires: Number.parseInt(expiresRaw, 10),
    keyid,
    alg,
    nonce,
    tag,
    signature: base64ToUint8(sigMatch[1]),
  };
}

function hasNoStoreDirective(cacheControl: string | null | undefined): boolean {
  if (!cacheControl) return false;
  return cacheControl
    .split(',')
    .map((part) => part.trim().split(';')[0]?.trim().toLowerCase())
    .some((directive) => directive === 'no-store');
}

function normalizeRequestUri(uri: string): string {
  const url = new URL(uri);
  url.hash = '';
  return url.toString();
}

function requestAuthority(uri: string): string {
  const url = new URL(uri);
  const hostname = url.hostname.toLowerCase();
  const isDefaultPort =
    (url.protocol === 'https:' && (!url.port || url.port === '443')) ||
    (url.protocol === 'http:' && (!url.port || url.port === '80'));
  return !url.port || isDefaultPort ? hostname : `${hostname}:${url.port}`;
}

function buildV2SignatureBase(
  covered: V2CoveredItem[],
  signatureParamsRaw: string,
  ctx: { method: string; targetUri: string; authority: string; status: number; aidDomain?: string },
): Uint8Array {
  const lines: string[] = [];
  for (const item of covered) {
    if (item.name === '@method') lines.push(`"@method";req: ${ctx.method}`);
    if (item.name === '@target-uri') lines.push(`"@target-uri";req: ${ctx.targetUri}`);
    if (item.name === '@authority') lines.push(`"@authority";req: ${ctx.authority}`);
    if (item.name === 'aid-domain') {
      // Fail-closed invariant: unreachable in normal flow (the tag/coverage gates in
      // performV2PKAHandshake reject a covered aid-domain without a sent domain), kept as defense-in-depth.
      if (ctx.aidDomain === undefined) {
        throw new AidError(
          'ERR_SECURITY',
          'Signature covers aid-domain but no AID-Domain was sent',
        );
      }
      lines.push(`"aid-domain";req: ${ctx.aidDomain}`);
    }
    if (item.name === '@status') lines.push(`"@status": ${ctx.status}`);
  }
  lines.push(`"@signature-params": ${signatureParamsRaw}`);
  return new TextEncoder().encode(lines.join('\n'));
}

async function deriveAid2KeyMaterial(
  pka: string,
  cryptoImpl: CryptoLike,
): Promise<{ publicKey: Uint8Array; keyid: string }> {
  const publicKey = base64UrlToUint8(pka);
  if (publicKey.length !== 32) throw new AidError('ERR_SECURITY', 'Invalid PKA length');
  const jwkThumbprintInput = `{"crv":"Ed25519","kty":"OKP","x":"${pka}"}`;
  const digest = await cryptoImpl.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(jwkThumbprintInput),
  );
  return { publicKey, keyid: uint8ToBase64Url(new Uint8Array(digest)) };
}

function buildAcceptSignatureV2(keyid: string, nonce: string, domainBound: boolean): string {
  const covered = domainBound
    ? '("@method";req "@target-uri";req "@authority";req "aid-domain";req "@status")'
    : '("@method";req "@target-uri";req "@authority";req "@status")';
  const tag = domainBound ? AID_PKA_TAG_V2_DB : AID_PKA_TAG_V2;
  return `aid-pka=${covered};created;expires;keyid="${keyid}";alg="ed25519";nonce="${nonce}";tag="${tag}"`;
}

async function performV1PKAHandshake(uri: string, pka: string, kid: string): Promise<void> {
  if (!kid) throw new AidError('ERR_SECURITY', 'Missing kid for PKA');
  const u = new URL(uri);
  const cryptoImpl: CryptoLike =
    (globalThis as unknown as { crypto?: CryptoLike }).crypto ??
    (nodeWebcrypto as unknown as CryptoLike);
  const nonce = cryptoImpl.getRandomValues(new Uint8Array(32));
  const challenge = uint8ToBase64Url(nonce);
  const date = new Date().toUTCString();
  const fetchImpl = (globalThis as unknown as { fetch?: FetchLike }).fetch;
  if (typeof fetchImpl !== 'function') {
    throw new AidError('ERR_SECURITY', 'fetch is not available in this environment');
  }
  const res = await fetchImpl(uri, {
    method: 'GET',
    headers: {
      'AID-Challenge': challenge,
      Date: date,
    },
    redirect: 'error',
  });
  if (!res.ok) throw new AidError('ERR_SECURITY', `Handshake HTTP ${res.status}`);

  const { covered, created, keyid, keyidRaw, alg, signature, responseDate } =
    parseV1SignatureHeaders(res.headers);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - created) > 300)
    throw new AidError('ERR_SECURITY', 'Signature created timestamp outside acceptance window');
  if (responseDate) {
    const parsed = Math.floor(new Date(responseDate).getTime() / 1000);
    if (!Number.isFinite(parsed)) throw new AidError('ERR_SECURITY', 'Invalid Date header');
    if (Math.abs(now - parsed) > 300)
      throw new AidError('ERR_SECURITY', 'HTTP Date header outside acceptance window');
  }
  if (!timingSafeEqual(keyid, kid)) throw new AidError('ERR_SECURITY', 'Signature keyid mismatch');
  if (!timingSafeEqual(alg, 'ed25519'))
    throw new AidError('ERR_SECURITY', 'Unsupported signature algorithm');

  const host = u.host;
  const base = buildV1SignatureBase(
    covered,
    { created, keyid: keyidRaw, alg },
    {
      method: 'GET',
      targetUri: uri,
      host,
      date: responseDate ?? date,
      challenge,
    },
  );
  const pub = multibaseDecode(pka);
  if (pub.length !== 32) throw new AidError('ERR_SECURITY', 'Invalid PKA length');

  const key = await cryptoImpl.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
  const ok = await cryptoImpl.subtle.verify('Ed25519', key, signature, base);
  if (!ok) throw new AidError('ERR_SECURITY', 'PKA signature verification failed');
}

async function performV2PKAHandshake(
  uri: string,
  pka: string,
  domain?: string,
): Promise<PKAHandshakeResult> {
  const cryptoImpl: CryptoLike =
    (globalThis as unknown as { crypto?: CryptoLike }).crypto ??
    (nodeWebcrypto as unknown as CryptoLike);
  const { publicKey, keyid: expectedKeyid } = await deriveAid2KeyMaterial(pka, cryptoImpl);
  const canonicalDomain = domain === undefined ? undefined : canonicalizeAidDomain(domain);
  const nonce = uint8ToBase64Url(cryptoImpl.getRandomValues(new Uint8Array(32)));
  const requestUri = normalizeRequestUri(uri);
  const authority = requestAuthority(requestUri);
  const fetchImpl = (globalThis as unknown as { fetch?: FetchLike }).fetch;
  if (typeof fetchImpl !== 'function') {
    throw new AidError('ERR_SECURITY', 'fetch is not available in this environment');
  }

  let res: FetchResponse;
  try {
    res = await fetchImpl(requestUri, {
      method: 'GET',
      headers: {
        'Accept-Signature': buildAcceptSignatureV2(
          expectedKeyid,
          nonce,
          canonicalDomain !== undefined,
        ),
        'Cache-Control': 'no-store',
        ...(canonicalDomain !== undefined ? { [AID_DOMAIN_HEADER]: canonicalDomain } : {}),
      },
      redirect: 'error',
    });
  } catch (error) {
    throw new AidError('ERR_SECURITY', error instanceof Error ? error.message : String(error));
  }

  if (res.status >= 300 && res.status < 400) {
    throw new AidError('ERR_SECURITY', 'PKA redirects are not allowed');
  }
  if (!hasNoStoreDirective(res.headers.get('Cache-Control') || res.headers.get('cache-control'))) {
    throw new AidError('ERR_SECURITY', 'PKA response must include Cache-Control: no-store');
  }

  const parsed = parseV2SignatureHeaders(res.headers);
  const now = Math.floor(Date.now() / 1000);
  const skewSeconds = 30;
  if (parsed.expires <= parsed.created || parsed.expires - parsed.created > 300) {
    throw new AidError('ERR_SECURITY', 'Invalid signature freshness window');
  }
  if (parsed.created - now > skewSeconds || now - parsed.expires > skewSeconds) {
    throw new AidError('ERR_SECURITY', 'Signature timestamp outside acceptance window');
  }
  if (!timingSafeEqual(parsed.keyid, expectedKeyid)) {
    throw new AidError('ERR_SECURITY', 'Signature keyid mismatch');
  }
  if (!timingSafeEqual(asciiLowerCase(parsed.alg), 'ed25519')) {
    throw new AidError('ERR_SECURITY', 'Unsupported signature algorithm');
  }
  if (!timingSafeEqual(parsed.nonce, nonce)) {
    throw new AidError('ERR_SECURITY', 'Signature nonce mismatch');
  }
  const isDomainBound = timingSafeEqual(parsed.tag, AID_PKA_TAG_V2_DB);
  if (!isDomainBound && !timingSafeEqual(parsed.tag, AID_PKA_TAG_V2)) {
    throw new AidError('ERR_SECURITY', 'Invalid signature tag');
  }
  if (isDomainBound && canonicalDomain === undefined) {
    throw new AidError('ERR_SECURITY', 'Unrequested domain-bound signature tag');
  }

  const base = buildV2SignatureBase(parsed.covered, parsed.signatureParamsRaw, {
    method: 'GET',
    targetUri: requestUri,
    authority,
    status: res.status,
    ...(canonicalDomain !== undefined ? { aidDomain: canonicalDomain } : {}),
  });
  const key = await cryptoImpl.subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, [
    'verify',
  ]);
  const ok = await cryptoImpl.subtle.verify('Ed25519', key, parsed.signature, base);
  if (!ok) throw new AidError('ERR_SECURITY', 'PKA signature verification failed');
  return { domainBound: isDomainBound };
}

export async function performPKAHandshake(
  uri: string,
  pka: string,
  kid?: string,
  domain?: string,
): Promise<PKAHandshakeResult> {
  if (kid !== undefined) {
    await performV1PKAHandshake(uri, pka, kid);
    return { domainBound: false };
  }
  return await performV2PKAHandshake(uri, pka, domain);
}
