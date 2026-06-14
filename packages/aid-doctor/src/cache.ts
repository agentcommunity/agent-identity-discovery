import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import type { DoctorReport } from '@agentcommunity/aid-engine';

export const CACHE_SCHEMA_VERSION = 3;

export type CacheTrustSource = 'dns' | 'well-known-tls';
export type SecurityChangeStatus =
  | 'first_seen'
  | 'no_change'
  | 'pka_added'
  | 'pka_removed'
  | 'key_replaced'
  | 'version_downgrade'
  | 'binding_loss'
  | 'fallback_well_known_tls';

export interface CacheEntry {
  lastSeen: string;
  version?: string | null;
  trustSource?: CacheTrustSource;
  pka: string | null;
  kid: string | null;
  keyid?: string | null;
  jwkX?: string | null;
  domainBound?: boolean | null;
  hash?: string | null;
}

export interface CacheShape {
  schemaVersion: typeof CACHE_SCHEMA_VERSION;
  entries: Record<string, CacheEntry>;
}

function cachePath(): string {
  return path.join(os.homedir(), '.aid', 'cache.json');
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodeBase58(value: string): Uint8Array | null {
  let leadingZeros = 0;
  for (const char of value) {
    if (char !== '1') break;
    leadingZeros += 1;
  }
  if (leadingZeros === value.length) {
    return new Uint8Array(leadingZeros);
  }

  const bytes = [0];
  for (const char of value.slice(leadingZeros)) {
    const valueIndex = BASE58_ALPHABET.indexOf(char);
    if (valueIndex === -1) return null;
    let carry = valueIndex;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const decoded = bytes.reverse();
  return new Uint8Array([...new Array<number>(leadingZeros).fill(0), ...decoded]);
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.includes('=') || value.length % 4 === 1) {
    return null;
  }
  try {
    return new Uint8Array(Buffer.from(value, 'base64url'));
  } catch {
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

export function derivePkaKeyid(pka: string | null | undefined): {
  keyid: string;
  jwkX: string;
} | null {
  if (!pka) return null;
  const publicKey = pka.startsWith('z') ? decodeBase58(pka.slice(1)) : decodeBase64Url(pka);
  if (!publicKey || publicKey.length !== 32) return null;

  const jwkX = toBase64Url(publicKey);
  const thumbprintInput = `{"crv":"Ed25519","kty":"OKP","x":"${jwkX}"}`;
  return {
    jwkX,
    keyid: createHash('sha256').update(thumbprintInput).digest('base64url'),
  };
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<CacheEntry>;
  return (
    typeof entry.lastSeen === 'string' &&
    (typeof entry.pka === 'string' || entry.pka === null) &&
    (typeof entry.kid === 'string' || entry.kid === null)
  );
}

function migrateEntry(entry: CacheEntry): CacheEntry {
  const keyMaterial = derivePkaKeyid(entry.pka);
  return {
    ...entry,
    version: entry.version ?? (entry.pka?.startsWith('z') ? 'aid1' : entry.pka ? 'aid2' : null),
    trustSource: entry.trustSource ?? 'dns',
    keyid: entry.keyid ?? keyMaterial?.keyid ?? null,
    jwkX: entry.jwkX ?? keyMaterial?.jwkX ?? null,
    domainBound: entry.domainBound ?? null,
  };
}

export function migrateCacheFile(raw: unknown): CacheShape {
  if (
    raw &&
    typeof raw === 'object' &&
    (raw as Partial<CacheShape>).schemaVersion === CACHE_SCHEMA_VERSION &&
    (raw as Partial<CacheShape>).entries &&
    typeof (raw as Partial<CacheShape>).entries === 'object'
  ) {
    return raw as CacheShape;
  }

  const entries: Record<string, CacheEntry> = {};
  if (!raw || typeof raw !== 'object') {
    return { schemaVersion: CACHE_SCHEMA_VERSION, entries };
  }

  // A wrapped-but-stale file (older schemaVersion) must be migrated by descending
  // into its nested `entries` map. Iterating the top-level object and skipping the
  // `entries` key would silently DROP every entry on a schema bump.
  const wrapped = raw as Partial<CacheShape>;
  const source: Record<string, unknown> =
    wrapped.entries && typeof wrapped.entries === 'object'
      ? (wrapped.entries as Record<string, unknown>)
      : (raw as Record<string, unknown>);

  for (const [domain, entry] of Object.entries(source)) {
    if (domain === 'schemaVersion' || domain === 'entries') continue;
    if (isCacheEntry(entry)) {
      entries[domain] = migrateEntry(entry);
    }
  }

  return { schemaVersion: CACHE_SCHEMA_VERSION, entries };
}

export function buildCacheEntryFromReport(report: DoctorReport, now = new Date()): CacheEntry {
  const record = report.record.parsed;
  const keyMaterial = derivePkaKeyid(record?.pka ?? null);
  return {
    lastSeen: now.toISOString(),
    version: record?.v ?? null,
    trustSource: report.queried.wellKnown.used ? 'well-known-tls' : 'dns',
    pka: record?.pka ?? null,
    kid: record?.v === 'aid1' ? (record.kid ?? null) : null,
    keyid: keyMaterial?.keyid ?? null,
    jwkX: keyMaterial?.jwkX ?? null,
    domainBound: report.pka.domainBound ?? null,
    hash: report.cacheEntry?.hash ?? null,
  };
}

export function classifySecurityChange(
  previous: CacheEntry | null | undefined,
  current: CacheEntry,
): SecurityChangeStatus {
  if (current.trustSource === 'well-known-tls') {
    return 'fallback_well_known_tls';
  }

  if (!previous) return 'first_seen';

  if (previous.version === 'aid2' && current.version === 'aid1') {
    return 'version_downgrade';
  }

  const previousHasPka = Boolean(previous.pka || previous.keyid);
  const currentHasPka = Boolean(current.pka || current.keyid);
  if (!previousHasPka && currentHasPka) return 'pka_added';
  if (previousHasPka && !currentHasPka) return 'pka_removed';

  const previousKey = previous.keyid ?? previous.pka;
  const currentKey = current.keyid ?? current.pka;
  if (previousKey && currentKey && previousKey !== currentKey) {
    return 'key_replaced';
  }

  // Binding loss is warning-only. Keep it AFTER the fail-eligible branches above so
  // it can never mask a higher-severity downgrade (key replacement, version drop,
  // pka removal) — otherwise it would open a downgrade-evasion path.
  if (previous.domainBound === true && current.domainBound === false) {
    return 'binding_loss';
  }

  return 'no_change';
}

export async function loadCache(): Promise<CacheShape> {
  try {
    const p = cachePath();
    const data = await fs.readFile(p, 'utf8');
    return migrateCacheFile(JSON.parse(data));
  } catch {
    return { schemaVersion: CACHE_SCHEMA_VERSION, entries: {} };
  }
}

async function ensureDir(filePath: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
  } catch {
    // ignore
  }
}

export async function saveCache(cache: CacheShape): Promise<void> {
  const p = cachePath();
  await ensureDir(p);
  const tmp = p + '.tmp';
  const content = JSON.stringify(migrateCacheFile(cache), null, 2);
  await fs.writeFile(tmp, content, { mode: 0o600 });
  await fs.rename(tmp, p);
}
