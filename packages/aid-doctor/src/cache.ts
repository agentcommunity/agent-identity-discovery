import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { DoctorReport } from '@agentcommunity/aid-engine';
import {
  classifySecurityChange as engineClassifySecurityChange,
  derivePkaKeyid as engineDerivePkaKeyid,
} from '@agentcommunity/aid-engine';

export const CACHE_SCHEMA_VERSION = 3;

export type CacheTrustSource = 'dns' | 'well-known-tls';

// Re-exported from aid-engine so the doctor cache and the engine checker share a
// single source of truth for security-change classification (no divergent copy).
export type { SecurityChangeStatus } from '@agentcommunity/aid-engine';

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

// Re-exported from aid-engine: the engine owns the single PKA key-identity
// derivation, so the doctor cache and the engine checker can never diverge.
export const derivePkaKeyid = engineDerivePkaKeyid;

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

// Re-exported from aid-engine so the runtime CLI path and the engine checker use
// the identical classification logic (including the derivePkaKeyid fallback for
// pka-set/keyid-null entries). Eliminates the previous divergent copy that
// false-positived key_replaced for such entries.
export const classifySecurityChange = engineClassifySecurityChange;

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
