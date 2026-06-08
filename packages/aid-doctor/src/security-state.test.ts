import { describe, expect, it } from 'vitest';
import type { DoctorReport } from '@agentcommunity/aid-engine';
import { applySecurityState } from './security-state';
import type { CacheEntry } from './cache';

const OLD_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const NEW_KEY = 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ';

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
      createdSkewSec: null,
      covered: null,
    },
    downgrade: { checked: false, previous: null, status: null },
    exitCode: record ? 0 : 1,
    cacheEntry: null,
  };
}

function previous(overrides: Partial<CacheEntry> = {}): CacheEntry {
  return {
    lastSeen: '2026-05-01T00:00:00.000Z',
    version: 'aid2',
    trustSource: 'dns',
    pka: OLD_KEY,
    kid: null,
    keyid: 'ogRZbCR5KTrPFCAfuYmCMwj0w7Yuk3Lr6YWQWfpkbf0',
    jwkX: OLD_KEY,
    ...overrides,
  };
}

describe('security state application', () => {
  it.each([
    {
      name: 'pka_removed',
      report: reportFor({ v: 'aid2', uri: 'https://agent.example.com', proto: 'mcp' }),
    },
    {
      name: 'key_replaced',
      report: reportFor({
        v: 'aid2',
        uri: 'https://agent.example.com',
        proto: 'mcp',
        pka: NEW_KEY,
      }),
    },
    {
      name: 'version_downgrade',
      report: reportFor({
        v: 'aid1',
        uri: 'https://agent.example.com',
        proto: 'mcp',
        pka: OLD_KEY,
        kid: 'g1',
      }),
    },
    {
      name: 'fallback_well_known_tls',
      report: reportFor(
        { v: 'aid2', uri: 'https://agent.example.com', proto: 'mcp', pka: OLD_KEY },
        true,
      ),
    },
  ])('does not persist $name when fail policy rejects it', ({ report }) => {
    const result = applySecurityState(report, previous(), 'fail');

    expect(result.shouldPersist).toBe(false);
    expect(report.exitCode).toBe(1003);
    expect(report.cacheEntry).toBeNull();
  });

  it('keeps legacy warn policy cache updates for downgrade findings', () => {
    const report = reportFor({ v: 'aid2', uri: 'https://agent.example.com', proto: 'mcp' });
    const result = applySecurityState(report, previous(), 'warn');

    expect(result.shouldPersist).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(report.cacheEntry).toMatchObject({ pka: null, keyid: null });
  });

  it('does not reject first-seen TLS fallback as a trust-source downgrade', () => {
    const report = reportFor(
      { v: 'aid2', uri: 'https://agent.example.com', proto: 'mcp', pka: OLD_KEY },
      true,
    );

    const result = applySecurityState(report, undefined, 'fail');

    expect(result.shouldPersist).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(report.downgrade.status).toBe('fallback_well_known_tls');
  });

  it('preserves the prior cache entry when a fail-policy downgrade is rejected', () => {
    const previousEntry = previous();
    const cache = {
      schemaVersion: 2 as const,
      entries: {
        'example.com': previousEntry,
      },
    };
    const report = reportFor({ v: 'aid2', uri: 'https://agent.example.com', proto: 'mcp' });

    const result = applySecurityState(report, cache.entries['example.com'], 'fail');
    if (result.shouldPersist && report.cacheEntry) {
      cache.entries['example.com'] = report.cacheEntry;
    }

    expect(cache.entries['example.com']).toEqual(previousEntry);
  });
});
