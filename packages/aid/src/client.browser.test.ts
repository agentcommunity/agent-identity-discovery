import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as browser from './browser.js';

// We want to test the `discover` export from browser.ts, but mock the `queryTxtRecordsDoH`
// function that it calls internally.
vi.mock('./parser.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./parser.js')>();
  return { ...original };
});
vi.mock('./pka.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./pka.js')>();
  return { ...original };
});

describe('Browser client', () => {
  const g = globalThis as any;
  let origFetch: any;

  beforeEach(() => {
    origFetch = g.fetch;
  });
  afterEach(() => {
    g.fetch = origFetch;
    vi.restoreAllMocks();
  });

  describe('well-known fallback', () => {
    it('returns record from well-known JSON when DoH has no record', async () => {
      // Mock fetch for the .well-known call
      g.fetch = vi.fn(async (url: string) => {
        if (url.toString().startsWith('https://cloudflare-dns.com')) {
          // The DoH query should fail
          return {
            ok: true,
            status: 200,
            json: async () => ({ Status: 2 /* NXDOMAIN */ }),
          };
        }
        if (url.toString().includes('/.well-known/agent')) {
          return {
            ok: true,
            status: 200,
            headers: {
              get: (name: string) =>
                name.toLowerCase() === 'content-type' ? 'application/json' : null,
            },
            text: async () =>
              JSON.stringify({ v: 'aid1', u: 'https://api.example.com/mcp', p: 'mcp' }),
          };
        }
        return { ok: false, status: 404, text: async () => 'Not Found' };
      });

      const { record, queryName } = await browser.discover('example.com', {
        wellKnownFallback: true,
      });

      expect(queryName).toContain('/.well-known/agent');
      expect(record.v).toBe('aid1');
      expect(record.proto).toBe('mcp');
      expect(record.uri).toBe('https://api.example.com/mcp');
    });
  });

  describe('protocol resolution', () => {
    it('queries underscore, plain, and then base when protocol is specified', async () => {
      const dohResponses: Record<string, unknown> = {
        'https://cloudflare-dns.com/dns-query?name=_agent._mcp.example.com&type=TXT': {
          Status: 2 /* NXDOMAIN */,
        },
        'https://cloudflare-dns.com/dns-query?name=_agent.mcp.example.com&type=TXT': {
          Status: 2 /* NXDOMAIN */,
        },
        'https://cloudflare-dns.com/dns-query?name=_agent.example.com&type=TXT': {
          Status: 0,
          Answer: [
            {
              name: '_agent.example.com',
              type: 16,
              TTL: 300,
              data: '"v=aid1;u=https://fallback.example.com;p=mcp"',
            },
          ],
        },
      };

      g.fetch = vi.fn(async (url: string) => {
        const response = dohResponses[url.toString()];
        if (response) {
          return {
            ok: true,
            status: 200,
            json: async () => response,
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      const { record, queryName } = await browser.discover('example.com', { protocol: 'mcp' });

      expect(g.fetch).toHaveBeenCalledWith(
        'https://cloudflare-dns.com/dns-query?name=_agent._mcp.example.com&type=TXT',
        expect.any(Object),
      );
      expect(g.fetch).toHaveBeenCalledWith(
        'https://cloudflare-dns.com/dns-query?name=_agent.mcp.example.com&type=TXT',
        expect.any(Object),
      );
      expect(g.fetch).toHaveBeenCalledWith(
        'https://cloudflare-dns.com/dns-query?name=_agent.example.com&type=TXT',
        expect.any(Object),
      );

      expect(record.uri).toBe('https://fallback.example.com');
      expect(queryName).toBe('_agent.example.com');
    });
  });
});
