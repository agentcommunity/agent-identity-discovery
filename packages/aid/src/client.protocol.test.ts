import { describe, it, expect, vi, afterEach } from 'vitest';
import { discover } from './index.js';

vi.mock('dns-query', () => ({
  query: vi.fn(),
}));

describe('Client protocol resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queries underscore and then base when protocol is specified', async () => {
    const { query } = await import('dns-query');
    (query as any).mockImplementation(async ({ question }: { question: { name: string } }) => {
      if (question.name === '_agent._mcp.example.com') {
        // Simulate no record found for the protocol-specific query
        return { rcode: 'NXDOMAIN', answers: [] };
      }
      if (question.name === '_agent.example.com') {
        return {
          rcode: 'NOERROR',
          answers: [
            {
              type: 'TXT',
              name: '_agent.example.com',
              data: 'v=aid1;u=https://fallback.example.com;p=mcp',
            },
          ],
        };
      }
      return { rcode: 'NXDOMAIN', answers: [] };
    });

    const { record, queryName } = await discover('example.com', { protocol: 'mcp' });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        question: expect.objectContaining({ name: '_agent._mcp.example.com' }),
      }),
      expect.any(Object),
    );
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        question: expect.objectContaining({ name: '_agent.example.com' }),
      }),
      expect.any(Object),
    );
    expect(query).not.toHaveBeenCalledWith(
      expect.objectContaining({
        question: expect.objectContaining({ name: '_agent.mcp.example.com' }),
      }),
      expect.any(Object),
    );

    expect(record.uri).toBe('https://fallback.example.com');
    expect(queryName).toBe('_agent.example.com');
  });

  it('keeps protocol discovery on the exact host and never walks parent domains', async () => {
    const calls: string[] = [];
    const { query } = await import('dns-query');
    (query as any).mockImplementation(async ({ question }: { question: { name: string } }) => {
      calls.push(question.name);
      if (question.name === '_agent._mcp.app.team.example.com') {
        return { rcode: 'NXDOMAIN', answers: [] };
      }
      if (question.name === '_agent.app.team.example.com') {
        return {
          rcode: 'NOERROR',
          answers: [
            {
              type: 'TXT',
              name: '_agent.app.team.example.com',
              data: 'v=aid1;u=https://app.team.example.com/mcp;p=mcp',
            },
          ],
        };
      }
      return { rcode: 'NXDOMAIN', answers: [] };
    });

    const { record, queryName } = await discover('app.team.example.com', { protocol: 'mcp' });

    expect(record.uri).toBe('https://app.team.example.com/mcp');
    expect(queryName).toBe('_agent.app.team.example.com');
    expect(calls).toEqual(['_agent._mcp.app.team.example.com', '_agent.app.team.example.com']);
    expect(calls).not.toContain('_agent._mcp.team.example.com');
    expect(calls).not.toContain('_agent.team.example.com');
    expect(calls).not.toContain('_agent.example.com');
  });

  it('fails on multiple valid TXT answers for the same queried name', async () => {
    const { query } = await import('dns-query');
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid1;u=https://one.example.com;p=mcp',
        },
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid1;u=https://two.example.com;p=mcp',
        },
      ],
    });

    await expect(discover('example.com')).rejects.toMatchObject({
      errorCode: 'ERR_INVALID_TXT',
    });
  });

  it('accepts one valid TXT answer when another is malformed', async () => {
    const { query } = await import('dns-query');
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid1;u=http://bad.example.com;p=mcp',
        },
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: 'v=aid1;u=https://good.example.com;p=mcp',
        },
      ],
    });

    const { record } = await discover('example.com');
    expect(record.uri).toBe('https://good.example.com');
  });
});
