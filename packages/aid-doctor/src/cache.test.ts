import { describe, expect, it } from 'vitest';
import {
  CACHE_SCHEMA_VERSION,
  buildCacheEntryFromReport,
  classifySecurityChange,
  derivePkaKeyid,
  migrateCacheFile,
} from './cache';
import type { DoctorReport } from '@agentcommunity/aid-engine';

const LEGACY_ZERO_PKA = `z${'1'.repeat(32)}`;
const ZERO_JWK_X = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ZERO_JWK_THUMBPRINT = 'ogRZbCR5KTrPFCAfuYmCMwj0w7Yuk3Lr6YWQWfpkbf0';

function reportFor(record: DoctorReport['record']['parsed'], usedWellKnown = false): DoctorReport {
  return {
    domain: 'example.com',
    queried: {
      strategy: 'base-first',
      hint: { source: 'cli', present: false },
      attempts: [{ name: '_agent.example.com', type: 'TXT', result: 'NOERROR', ttl: 300 }],
      wellKnown: {
        attempted: usedWellKnown,
        used: usedWellKnown,
        url: usedWellKnown ? 'https://example.com/.well-known/agent' : null,
        httpStatus: usedWellKnown ? 200 : null,
        contentType: usedWellKnown ? 'application/json' : null,
        byteLength: usedWellKnown ? 100 : null,
        status: usedWellKnown ? 'ok' : null,
        snippet: null,
      },
    },
    record: {
      raw: record ? `v=${record.v};u=${record.uri};p=${record.proto}` : null,
      parsed: record,
      valid: Boolean(record),
      warnings: [],
      errors: [],
    },
    dnssec: { present: false, method: 'RRSIG', proof: null },
    tls: {
      checked: false,
      valid: null,
      host: null,
      sni: null,
      issuer: null,
      san: null,
      validFrom: null,
      validTo: null,
      daysRemaining: null,
      redirectBlocked: null,
    },
    pka: {
      present: Boolean(record?.pka),
      attempted: Boolean(record?.pka),
      verified: record?.pka ? true : null,
      kid: record?.v === 'aid1' ? (record.kid ?? null) : null,
      alg: record?.pka ? 'ed25519' : null,
    },
    downgrade: { checked: false, previous: null, status: null },
    exitCode: record ? 0 : 1,
    cacheEntry: null,
  };
}

describe('aid-doctor cache migration', () => {
  it('migrates legacy domain-keyed cache files and backfills v1 JWK thumbprints', () => {
    const migrated = migrateCacheFile({
      'legacy.example': {
        lastSeen: '2026-05-01T00:00:00.000Z',
        pka: LEGACY_ZERO_PKA,
        kid: 'g1',
        hash: 'raw-record-hash',
      },
      'no-pka.example': {
        lastSeen: '2026-05-02T00:00:00.000Z',
        pka: null,
        kid: null,
      },
    });

    expect(migrated.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
    expect(Object.keys(migrated.entries)).toEqual(['legacy.example', 'no-pka.example']);
    expect(migrated.entries['legacy.example']).toMatchObject({
      pka: LEGACY_ZERO_PKA,
      kid: 'g1',
      keyid: ZERO_JWK_THUMBPRINT,
      jwkX: ZERO_JWK_X,
      hash: 'raw-record-hash',
    });
    expect(migrated.entries['no-pka.example']).toMatchObject({
      pka: null,
      kid: null,
      keyid: null,
    });
  });

  it('preserves schema-versioned cache files when reading them back', () => {
    const current = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      entries: {
        'v2.example': {
          lastSeen: '2026-05-03T00:00:00.000Z',
          version: 'aid2',
          trustSource: 'dns',
          pka: ZERO_JWK_X,
          kid: null,
          keyid: ZERO_JWK_THUMBPRINT,
          jwkX: ZERO_JWK_X,
        },
      },
    };

    expect(migrateCacheFile(current)).toEqual(current);
  });

  it('migrates a v2 cache file to v3 without dropping entries, backfilling domainBound:null', () => {
    const legacy = {
      schemaVersion: 2,
      entries: {
        'example.com|mcp': {
          lastSeen: '2026-06-01',
          pka: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
          kid: null,
        },
      },
    };
    const migrated = migrateCacheFile(legacy as any);
    expect(migrated.schemaVersion).toBe(3);
    const entries = Object.values(migrated.entries);
    expect(entries).toHaveLength(1); // entry survived migration — guards against the data-loss path
    expect(entries[0].domainBound ?? null).toBeNull();
  });
});

describe('aid-doctor security state', () => {
  it('derives the same thumbprint for a legacy v1 multibase key and an aid2 JWK x key', () => {
    expect(derivePkaKeyid(LEGACY_ZERO_PKA)).toEqual({
      keyid: ZERO_JWK_THUMBPRINT,
      jwkX: ZERO_JWK_X,
    });
    expect(derivePkaKeyid(ZERO_JWK_X)).toEqual({
      keyid: ZERO_JWK_THUMBPRINT,
      jwkX: ZERO_JWK_X,
    });
  });

  it('does not classify aid1-to-aid2 with the same raw key as replacement', () => {
    const previous = {
      lastSeen: '2026-05-01T00:00:00.000Z',
      version: 'aid1',
      trustSource: 'dns' as const,
      pka: LEGACY_ZERO_PKA,
      kid: 'g1',
      keyid: ZERO_JWK_THUMBPRINT,
      jwkX: ZERO_JWK_X,
    };
    const current = buildCacheEntryFromReport(
      reportFor({
        v: 'aid2',
        uri: 'https://agent.example.com',
        proto: 'mcp',
        pka: ZERO_JWK_X,
      }),
      new Date('2026-05-04T00:00:00.000Z'),
    );

    expect(classifySecurityChange(previous, current)).toBe('no_change');
  });

  it('classifies pka additions, removals, replacements, version downgrades, and TLS fallback trust', () => {
    const base = {
      lastSeen: '2026-05-01T00:00:00.000Z',
      version: 'aid2',
      trustSource: 'dns' as const,
      pka: ZERO_JWK_X,
      kid: null,
      keyid: ZERO_JWK_THUMBPRINT,
      jwkX: ZERO_JWK_X,
    };

    expect(classifySecurityChange({ ...base, pka: null, keyid: null }, base)).toBe('pka_added');
    expect(classifySecurityChange(base, { ...base, pka: null, keyid: null })).toBe('pka_removed');
    expect(
      classifySecurityChange(base, {
        ...base,
        pka: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
        keyid: 'different-keyid',
        jwkX: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
      }),
    ).toBe('key_replaced');
    expect(classifySecurityChange(base, { ...base, version: 'aid1' })).toBe('version_downgrade');
    expect(classifySecurityChange(base, { ...base, trustSource: 'well-known-tls' })).toBe(
      'fallback_well_known_tls',
    );
    expect(classifySecurityChange(undefined, { ...base, trustSource: 'well-known-tls' })).toBe(
      'fallback_well_known_tls',
    );
  });

  it('classifies a binding loss when key/version are unchanged', () => {
    const base = {
      lastSeen: '2026-05-01T00:00:00.000Z',
      pka: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
      keyid: 'WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk',
      jwkX: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
      kid: null,
      version: 'aid2',
      trustSource: 'dns' as const,
    };
    const prev = { ...base, domainBound: true } as any;
    const cur = { ...base, domainBound: false } as any;
    expect(classifySecurityChange(prev, cur)).toBe('binding_loss');
  });

  it('prefers key_replaced over binding_loss when both change', () => {
    const base = {
      lastSeen: '2026-05-01T00:00:00.000Z',
      kid: null,
      version: 'aid2',
      trustSource: 'dns' as const,
    };
    const prev = {
      ...base,
      pka: 'AAAA',
      keyid: 'A',
      jwkX: 'AAAA',
      domainBound: true,
    } as any;
    const cur = {
      ...base,
      pka: 'BBBB',
      keyid: 'B',
      jwkX: 'BBBB',
      domainBound: false,
    } as any;
    expect(classifySecurityChange(prev, cur)).toBe('key_replaced'); // higher-severity, fail-eligible status wins
  });
});
