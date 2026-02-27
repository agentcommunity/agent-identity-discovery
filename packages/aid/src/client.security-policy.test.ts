import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discover } from './index.js';
import * as browser from './browser.js';

vi.mock('dns-query', () => ({
  query: vi.fn(),
}));

vi.mock('./pka.js', () => ({
  performPKAHandshake: vi.fn(async () => {}),
}));

describe('Discovery security policy', () => {
  const g = globalThis as { fetch?: typeof fetch };
  let originalFetch: typeof fetch | undefined;
  let originalWarn: typeof console.warn;

  beforeEach(() => {
    originalFetch = g.fetch;
    originalWarn = console.warn;
    console.warn = vi.fn();
  });

  afterEach(() => {
    g.fetch = originalFetch;
    console.warn = originalWarn;
    vi.restoreAllMocks();
  });

  it('node strict mode requires PKA', async () => {
    const { query } = await import('dns-query');
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid1;u=https://api.example.com/mcp;p=mcp',
          ttl: 300,
        },
      ],
    });

    await expect(discover('example.com', { securityMode: 'strict' })).rejects.toMatchObject({
      errorCode: 'ERR_SECURITY',
    });
  });

  it('node strict mode requires DNSSEC validation', async () => {
    const { query } = await import('dns-query');
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid1;u=https://api.example.com/mcp;p=mcp;k=zBase58EncodedKey;i=g1',
          ttl: 300,
        },
      ],
    });
    g.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/dns-json' },
      text: async () => JSON.stringify({ Status: 0, AD: false }),
    })) as typeof fetch;

    await expect(discover('example.com', { securityMode: 'strict' })).rejects.toMatchObject({
      errorCode: 'ERR_SECURITY',
    });
  });

  it('node balanced mode warns when DNSSEC is preferred but unavailable', async () => {
    const { query } = await import('dns-query');
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid1;u=https://api.example.com/mcp;p=mcp',
          ttl: 300,
        },
      ],
    });
    g.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/dns-json' },
      text: async () => JSON.stringify({ Status: 0, AD: false }),
    })) as typeof fetch;

    const result = await discover('example.com', { securityMode: 'balanced' });
    expect(result.security.warnings.map((warning) => warning.code)).toContain('DNSSEC_PREFERRED');
  });

  it('node can fail on downgrade when previous security state is supplied', async () => {
    const { query } = await import('dns-query');
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid1;u=https://api.example.com/mcp;p=mcp',
          ttl: 300,
        },
      ],
    });

    await expect(
      discover('example.com', {
        dnssecPolicy: 'off',
        downgradePolicy: 'fail',
        previousSecurity: { pka: 'zOldKey', kid: 'g1' },
      }),
    ).rejects.toMatchObject({
      errorCode: 'ERR_SECURITY',
    });
  });

  it('node strict mode disables well-known fallback', async () => {
    const { query } = await import('dns-query');
    (query as any).mockImplementation(async () => {
      const error: any = new Error('ENOTFOUND');
      error.code = 'ENOTFOUND';
      throw error;
    });
    g.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ v: 'aid1', u: 'https://api.example.com/mcp', p: 'mcp' }),
    })) as typeof fetch;

    await expect(discover('example.com', { securityMode: 'strict' })).rejects.toMatchObject({
      errorCode: 'ERR_NO_RECORD',
    });
  });

  it('browser strict mode requires DNSSEC validation', async () => {
    g.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        Status: 0,
        AD: false,
        Answer: [
          {
            name: '_agent.example.com',
            type: 16,
            TTL: 300,
            data: '"v=aid1;u=https://api.example.com/mcp;p=mcp;k=zBase58EncodedKey;i=g1"',
          },
        ],
      }),
    })) as typeof fetch;

    await expect(browser.discover('example.com', { securityMode: 'strict' })).rejects.toMatchObject(
      {
        errorCode: 'ERR_SECURITY',
      },
    );
  });

  it('browser strict mode disables well-known fallback', async () => {
    g.fetch = vi.fn(async (url: string | URL) => {
      if (url.toString().includes('cloudflare-dns.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ Status: 2 }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ v: 'aid1', u: 'https://api.example.com/mcp', p: 'mcp' }),
      } as Response;
    }) as typeof fetch;

    await expect(browser.discover('example.com', { securityMode: 'strict' })).rejects.toMatchObject(
      {
        errorCode: 'ERR_NO_RECORD',
      },
    );
  });
});
