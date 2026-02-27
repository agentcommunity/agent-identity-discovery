import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { discover } from './index.js';
import * as browser from './browser.js';

vi.mock('dns-query', () => ({
  query: vi.fn(),
}));

vi.mock('./pka.js', () => ({
  performPKAHandshake: vi.fn(async () => {}),
}));

type EnterprisePolicyCase = {
  name: string;
  runtime: 'node' | 'browser';
  queryName: string;
  options: Record<string, unknown>;
  dns: {
    answers?: Array<{ name: string; data: string; ttl: number }>;
    errorCode?: string;
    ad?: boolean;
  };
  wellKnown?: {
    body?: Record<string, unknown>;
  };
  expect: {
    errorCode?: string;
    warningCodes?: string[];
  };
};

const __dirnameFix = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirnameFix, '../../..', 'test-fixtures', 'enterprise.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as {
  securityPolicies: EnterprisePolicyCase[];
};

describe('Discovery security policy vectors', () => {
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

  for (const vector of fixture.securityPolicies) {
    it(vector.name, async () => {
      const domain = vector.queryName.replace(/^_agent\./, '');

      if (vector.runtime === 'node') {
        const { query } = await import('dns-query');
        (query as any).mockImplementation(async () => {
          if (vector.dns.errorCode === 'ERR_NO_RECORD') {
            const error: any = new Error('ENOTFOUND');
            error.code = 'ENOTFOUND';
            throw error;
          }
          return {
            rcode: 'NOERROR',
            answers: (vector.dns.answers ?? []).map((answer) => ({
              type: 'TXT',
              name: answer.name,
              data: answer.data,
              ttl: answer.ttl,
            })),
          };
        });

        g.fetch = vi.fn(async () => ({
          ok: true,
          status: 200,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === 'content-type' ? 'application/json' : 'application/dns-json',
          },
          text: async () =>
            JSON.stringify(
              vector.wellKnown?.body ?? {
                Status: 0,
                AD: vector.dns.ad ?? false,
              },
            ),
        })) as typeof fetch;

        if (vector.expect.errorCode) {
          await expect(discover(domain, vector.options as any)).rejects.toMatchObject({
            errorCode: vector.expect.errorCode,
          });
          return;
        }

        const result = await discover(domain, vector.options as any);
        expect(result.security.warnings.map((warning) => warning.code)).toEqual(
          vector.expect.warningCodes ?? [],
        );
        return;
      }

      g.fetch = vi.fn(async (url: string | URL) => {
        if (url.toString().includes('cloudflare-dns.com')) {
          if (vector.dns.errorCode === 'ERR_NO_RECORD') {
            return {
              ok: true,
              status: 200,
              json: async () => ({ Status: 2 }),
            } as Response;
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              Status: 0,
              AD: vector.dns.ad ?? false,
              Answer: (vector.dns.answers ?? []).map((answer) => ({
                name: answer.name,
                type: 16,
                TTL: answer.ttl,
                data: `"${answer.data}"`,
              })),
            }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          headers: {
            get: () => 'application/json',
          },
          text: async () =>
            JSON.stringify(
              vector.wellKnown?.body ?? { v: 'aid1', u: 'https://api.example.com/mcp', p: 'mcp' },
            ),
        } as Response;
      }) as typeof fetch;

      if (vector.expect.errorCode) {
        await expect(browser.discover(domain, vector.options as any)).rejects.toMatchObject({
          errorCode: vector.expect.errorCode,
        });
        return;
      }

      const result = await browser.discover(domain, vector.options as any);
      expect(result.security.warnings.map((warning) => warning.code)).toEqual(
        vector.expect.warningCodes ?? [],
      );
    });
  }
});
