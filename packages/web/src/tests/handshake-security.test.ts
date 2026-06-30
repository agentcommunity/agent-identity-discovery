import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DoctorReport } from '@agentcommunity/aid-engine';

// Mock the aid-engine module so we can control report.pka.domainBound
vi.mock('@agentcommunity/aid-engine', () => ({
  runCheck: vi.fn(),
}));

import { runCheck } from '@agentcommunity/aid-engine';
import { getSecurityInfo } from '@/lib/api/handshake-security';

const makeReport = (domainBound: boolean | null | undefined): DoctorReport =>
  ({
    domain: 'example.com',
    dnssec: { present: false },
    pka: {
      present: true,
      attempted: true,
      verified: true,
      kid: null,
      keyid: 'test-keyid',
      alg: 'EdDSA',
      domainBound,
    },
    tls: { checked: true, valid: true, daysRemaining: 90 },
    record: { warnings: [], errors: [] },
    downgrade: { checked: false, previous: null, status: null },
    queried: { block: null },
    exitCode: 0,
    cacheEntry: null,
  }) as unknown as DoctorReport;

const mockedRunCheck = vi.mocked(runCheck);

describe('getSecurityInfo – domain-bound propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes domainBound: false when report.pka.domainBound is false', async () => {
    mockedRunCheck.mockResolvedValueOnce(makeReport(false));

    const info = await getSecurityInfo('example.com');
    expect(info).toBeDefined();
    const pka = info?.pka as Record<string, unknown> | undefined;
    expect(pka).toBeDefined();
    expect(pka?.domainBound).toBe(false);
  });

  it('includes domainBound: true when report.pka.domainBound is true', async () => {
    mockedRunCheck.mockResolvedValueOnce(makeReport(true));

    const info = await getSecurityInfo('example.com');
    expect(info).toBeDefined();
    const pka = info?.pka as Record<string, unknown> | undefined;
    expect(pka).toBeDefined();
    expect(pka?.domainBound).toBe(true);
  });
});
