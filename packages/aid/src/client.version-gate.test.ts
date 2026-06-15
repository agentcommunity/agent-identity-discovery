import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discover } from './index.js';

// Mock dns-query so we control exactly which TXT records the discovery sees.
vi.mock('dns-query', () => ({
  query: vi.fn(),
}));

describe('looksLikeAidRecord gate (version= vs v=)', () => {
  const g = globalThis as any;
  let origFetch: any;

  beforeEach(() => {
    origFetch = g.fetch;
  });
  afterEach(() => {
    g.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('does NOT treat `version=aidN` as an AID record (parser only consumes `v`)', async () => {
    const { query } = await import('dns-query');
    // A record that uses the non-spec `version` spelling. The parser has no
    // `version` case, so if the gate let this through it would surface a
    // confusing ERR_INVALID_TXT "Missing required field: v" and suppress the
    // well-known fallback. With the gate matching only `v`, this record is
    // skipped as non-AID-like and the DNS path yields ERR_NO_RECORD instead.
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'version=aid2;u=https://api.example.com/mcp;p=mcp',
        },
      ],
    });

    // No well-known fallback: the DNS path must report no AID record (NOT
    // ERR_INVALID_TXT from a half-parsed `version=` record).
    await expect(discover('example.com', { wellKnownFallback: false })).rejects.toMatchObject({
      errorCode: 'ERR_NO_RECORD',
    });
  });

  it('falls back to well-known when the only DNS record uses `version=aidN`', async () => {
    const { query } = await import('dns-query');
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'version=aid2;u=https://api.example.com/mcp;p=mcp',
        },
      ],
    });

    // The well-known endpoint serves a valid record; because the `version=`
    // DNS record is correctly classified as non-AID, the fallback is reached.
    g.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      text: async () => JSON.stringify({ v: 'aid1', u: 'https://api.example.com/mcp', p: 'mcp' }),
    }));

    const { record, queryName } = await discover('example.com', { wellKnownFallback: true });
    expect(queryName).toContain('/.well-known/agent');
    expect(record.v).toBe('aid1');
    expect(record.proto).toBe('mcp');
  });

  it('still parses a canonical `v=aidN` record from DNS', async () => {
    const { query } = await import('dns-query');
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid1;u=https://api.example.com/mcp;p=mcp',
        },
      ],
    });

    const { record } = await discover('example.com', { wellKnownFallback: false });
    expect(record.v).toBe('aid1');
    expect(record.proto).toBe('mcp');
    expect(record.uri).toBe('https://api.example.com/mcp');
  });
});
