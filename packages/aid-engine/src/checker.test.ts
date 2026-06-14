import { beforeEach, describe, expect, it, vi } from 'vitest';
import { performPKAHandshake } from '@agentcommunity/aid';

let nextDiscovery: any;

vi.mock('@agentcommunity/aid', () => {
  class AidError extends Error {
    errorCode: string;
    code: number;
    details?: unknown;

    constructor(errorCode: string, message: string, details?: unknown) {
      super(message);
      this.errorCode = errorCode;
      this.code = errorCode === 'ERR_SECURITY' ? 1003 : 1000;
      this.details = details;
    }
  }

  return {
    AidError,
    enforceRedirectPolicy: vi.fn().mockResolvedValue(undefined),
    performPKAHandshake: vi.fn().mockResolvedValue({ domainBound: false }),
  };
});

vi.mock('./dns', () => ({
  runBaseDiscovery: vi.fn(async () => ({ ok: true, value: nextDiscovery })),
}));

vi.mock('./tls_inspect', () => ({
  inspectTls: vi.fn(async () => ({
    host: 'api.example.com',
    sni: 'api.example.com',
    issuer: 'Test',
    san: ['api.example.com'],
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: '2027-01-01T00:00:00.000Z',
    daysRemaining: 200,
  })),
}));

vi.mock('./dnssec', () => ({
  probeDnssecRrsigTxt: vi.fn(async () => ({ present: false, method: 'RRSIG', proof: null })),
}));

vi.mock('./protoProbe', () => ({
  runProtocolProbe: vi.fn(),
}));

import { runCheck } from './checker';
import type { CacheEntry } from './types';

const ZERO_JWK_X = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ZERO_THUMBPRINT = 'ogRZbCR5KTrPFCAfuYmCMwj0w7Yuk3Lr6YWQWfpkbf0';
const LEGACY_ZERO_PKA = `z${'1'.repeat(32)}`;

function discovery(record: any, queryName = '_agent.example.com') {
  return {
    record,
    raw: `v=${record.v};u=${record.uri};p=${record.proto}${record.pka ? `;k=${record.pka}` : ''}`,
    queryName,
    ttl: 300,
    security: { warnings: [], wellKnown: { used: queryName.startsWith('https') } },
  };
}

async function check(previousCacheEntry?: CacheEntry) {
  return await runCheck('example.com', {
    timeoutMs: 1,
    allowFallback: true,
    wellKnownTimeoutMs: 1,
    checkDowngrade: true,
    ...(previousCacheEntry ? { previousCacheEntry } : {}),
  });
}

function previousAid2(overrides: Partial<CacheEntry> = {}): CacheEntry {
  return {
    lastSeen: '2026-05-01T00:00:00.000Z',
    version: 'aid2',
    trustSource: 'dns',
    pka: ZERO_JWK_X,
    kid: null,
    keyid: ZERO_THUMBPRINT,
    jwkX: ZERO_JWK_X,
    ...overrides,
  };
}

describe('runCheck security-state downgrade cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not flag same-key aid1 to aid2 migration as rotation', async () => {
    nextDiscovery = discovery({
      v: 'aid2',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      pka: ZERO_JWK_X,
    });

    const report = await check({
      lastSeen: '2026-05-01T00:00:00.000Z',
      version: 'aid1',
      trustSource: 'dns',
      pka: LEGACY_ZERO_PKA,
      kid: 'g1',
      keyid: ZERO_THUMBPRINT,
      jwkX: ZERO_JWK_X,
    });

    expect(report.downgrade.status).toBe('no_change');
    expect(report.downgrade.status).not.toBe('key_rotation');
  });

  it('detects aid2 to aid1 version downgrade', async () => {
    nextDiscovery = discovery({
      v: 'aid1',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
    });

    const report = await check(previousAid2());

    expect(report.downgrade.status).toBe('version_downgrade');
  });

  it('detects DNS to well-known TLS trust downgrade', async () => {
    nextDiscovery = discovery(
      { v: 'aid2', uri: 'https://api.example.com/mcp', proto: 'mcp', pka: ZERO_JWK_X },
      'https://example.com/.well-known/agent',
    );

    const report = await check(previousAid2());

    expect(report.downgrade.status).toBe('fallback_well_known_tls');
  });

  it('persists aid2 derived key identity in the cache entry', async () => {
    nextDiscovery = discovery({
      v: 'aid2',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      pka: ZERO_JWK_X,
    });

    const report = await check();

    expect(report.pka).toMatchObject({
      present: true,
      kid: null,
      keyid: ZERO_THUMBPRINT,
    });
    expect(report.cacheEntry).toMatchObject({
      version: 'aid2',
      trustSource: 'dns',
      pka: ZERO_JWK_X,
      kid: null,
      keyid: ZERO_THUMBPRINT,
      jwkX: ZERO_JWK_X,
    });
  });

  it('detects domain-binding loss when previous was bound and current is unbound', async () => {
    const mockedPerformPKAHandshake = vi.mocked(performPKAHandshake);
    // Current handshake returns domainBound:false
    mockedPerformPKAHandshake.mockResolvedValueOnce({ domainBound: false });
    nextDiscovery = discovery({
      v: 'aid2',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      pka: ZERO_JWK_X,
    });

    // Previous entry was domain-bound with the same key
    const report = await check(previousAid2({ domainBound: true }));

    expect(report.downgrade.status).toBe('binding_loss');
    expect(report.record.warnings.some((w) => w.code === 'BINDING_LOSS')).toBe(true);
  });

  it('records domainBound from the v2 handshake result', async () => {
    const mockedPerformPKAHandshake = vi.mocked(performPKAHandshake);
    mockedPerformPKAHandshake.mockResolvedValueOnce({ domainBound: true });
    nextDiscovery = discovery({
      v: 'aid2',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      pka: ZERO_JWK_X,
    });

    const report = await check();

    expect(report.pka.domainBound).toBe(true);
  });
});

describe('runCheck domain-binding policy', () => {
  const mockedPerformPKAHandshake = vi.mocked(performPKAHandshake);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function aid2Discovery() {
    return discovery({
      v: 'aid2',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      pka: ZERO_JWK_X,
    });
  }

  it('require domain-binding fails the PKA step on an unbound v2 proof', async () => {
    mockedPerformPKAHandshake.mockResolvedValueOnce({ domainBound: false });
    nextDiscovery = aid2Discovery();

    const report = await runCheck('example.com', {
      timeoutMs: 1,
      allowFallback: true,
      wellKnownTimeoutMs: 1,
      checkDowngrade: true,
      domainBindingPolicy: 'require',
    });

    expect(report.pka.verified).toBe(false);
    expect(report.exitCode).not.toBe(0); // failing exit code set
    // A rejected record must not be persisted as verified.
    expect(report.cacheEntry).toBeNull();
  });

  it('require domain-binding does NOT fail on a bound v2 proof', async () => {
    mockedPerformPKAHandshake.mockResolvedValueOnce({ domainBound: true });
    nextDiscovery = aid2Discovery();

    const report = await runCheck('example.com', {
      timeoutMs: 1,
      allowFallback: true,
      wellKnownTimeoutMs: 1,
      checkDowngrade: true,
      domainBindingPolicy: 'require',
    });

    expect(report.pka.verified).toBe(true);
    expect(report.exitCode).toBe(0);
  });

  it('off domain-binding does not pass a domain to the handshake (suppresses AID-Domain)', async () => {
    mockedPerformPKAHandshake.mockResolvedValueOnce({ domainBound: false });
    nextDiscovery = aid2Discovery();

    await runCheck('example.com', {
      timeoutMs: 1,
      allowFallback: true,
      wellKnownTimeoutMs: 1,
      domainBindingPolicy: 'off',
    });

    // performPKAHandshake(uri, pka, kid, domain) — 4th arg must be undefined when policy is 'off'
    expect(mockedPerformPKAHandshake).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      undefined,
    );
  });

  it('prefer (default) domain-binding passes the normalized domain to the handshake', async () => {
    mockedPerformPKAHandshake.mockResolvedValueOnce({ domainBound: false });
    nextDiscovery = aid2Discovery();

    await runCheck('example.com', {
      timeoutMs: 1,
      allowFallback: true,
      wellKnownTimeoutMs: 1,
    });

    expect(mockedPerformPKAHandshake).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      'example.com',
    );
  });
});
