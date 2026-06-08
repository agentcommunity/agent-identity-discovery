import { afterEach, describe, expect, it, vi } from 'vitest';
import { discover } from './index.js';

vi.mock('dns-query', () => ({
  query: vi.fn(),
}));

describe('AID v2 discovery selection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers one valid aid2 record over one valid aid1 record at the same name', async () => {
    const { query } = await import('dns-query');
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid1;u=https://v1.example.com/mcp;p=mcp',
          ttl: 300,
        },
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid2;u=https://v2.example.com/mcp;p=mcp',
          ttl: 300,
        },
      ],
    });

    const { record } = await discover('example.com');

    expect(record).toMatchObject({
      v: 'aid2',
      uri: 'https://v2.example.com/mcp',
      proto: 'mcp',
    });
  });

  it('fails on two valid aid2 records even when an aid1 record is also present', async () => {
    const { query } = await import('dns-query');
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid1;u=https://v1.example.com/mcp;p=mcp',
          ttl: 300,
        },
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid2;u=https://one.example.com/mcp;p=mcp',
          ttl: 300,
        },
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid2;u=https://two.example.com/mcp;p=mcp',
          ttl: 300,
        },
      ],
    });

    await expect(discover('example.com')).rejects.toMatchObject({
      errorCode: 'ERR_INVALID_TXT',
    });
  });

  it('falls back to aid1 when no valid aid2 record exists', async () => {
    const { query } = await import('dns-query');
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid2;u=http://bad.example.com/mcp;p=mcp',
          ttl: 300,
        },
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid1;u=https://v1.example.com/mcp;p=mcp',
          ttl: 300,
        },
      ],
    });

    const { record } = await discover('example.com');

    expect(record).toMatchObject({
      v: 'aid1',
      uri: 'https://v1.example.com/mcp',
      proto: 'mcp',
    });
  });

  it('selects one valid aid2 record when another aid2 record is malformed', async () => {
    const { query } = await import('dns-query');
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid2;u=http://bad.example.com/mcp;p=mcp',
          ttl: 300,
        },
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid2;u=https://v2.example.com/mcp;p=mcp',
          ttl: 300,
        },
      ],
    });

    const { record } = await discover('example.com');

    expect(record).toMatchObject({
      v: 'aid2',
      uri: 'https://v2.example.com/mcp',
      proto: 'mcp',
    });
  });

  it('does not fall back to well-known when DNS only has malformed AID-like TXT', async () => {
    const { query } = await import('dns-query');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      text: async () =>
        JSON.stringify({ v: 'aid2', u: 'https://fallback.example.com/mcp', p: 'mcp' }),
    } as any);
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid3;u=https://future.example.com/mcp;p=mcp',
          ttl: 300,
        },
      ],
    });

    await expect(discover('example.com', { wellKnownFallback: true })).rejects.toMatchObject({
      errorCode: 'ERR_INVALID_TXT',
    });
    expect(fetchSpy).not.toHaveBeenCalledWith(
      'https://example.com/.well-known/agent',
      expect.any(Object),
    );
  });
});
