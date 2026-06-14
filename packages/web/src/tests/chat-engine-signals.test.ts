import { describe, expect, it } from 'vitest';
import type { DiscoveryResult } from '@/hooks/use-discovery';
import { AuthRequiredError, type HandshakeResult } from '@/hooks/use-connection';
import {
  buildAuthRetryResultSignal,
  buildConnectionResultSignal,
  buildDiscoveryResultSignal,
} from '@/hooks/chat-engine/signals';

const discoveryOk = (): DiscoveryResult => ({
  ok: true,
  value: {
    record: {
      v: 'aid2',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      auth: 'pat',
      host: 'api.example.com',
      port: 443,
      desc: 'Example MCP',
    },
    metadata: {
      dnsQuery: '_agent.example.com',
      lookupTime: 42,
      recordType: 'TXT',
      source: 'DNS-over-HTTPS',
    },
  },
});

const discoveryContext = () => {
  const result = discoveryOk();
  if (!result.ok) throw new Error('Expected successful discovery fixture');
  return result.value;
};

describe('chat-engine signal builders', () => {
  it('builds a success discovery signal', () => {
    const signal = buildDiscoveryResultSignal('example.com', discoveryOk());
    expect(signal.stage).toBe('discovery');
    expect(signal.status).toBe('success');
    expect(signal.title).toContain('AID resolver');
    expect(signal.details?.some((d) => d.label === 'Protocol' && d.value === 'mcp')).toBe(true);
  });

  it('includes derived PKA keyid in discovery details', () => {
    const result = discoveryOk();
    if (!result.ok) throw new Error('Expected successful discovery fixture');
    result.value.metadata.pka = {
      present: true,
      verified: null,
      keyid: 'sYkYRKJfa8y8rCgWHb-qxqR4LY93c_hbbL10YbvT88o',
    };

    const signal = buildDiscoveryResultSignal('example.com', result);
    expect(
      signal.details?.some(
        (detail) =>
          detail.label === 'PKA keyid' &&
          detail.value === 'sYkYRKJfa8y8rCgWHb-qxqR4LY93c_hbbL10YbvT88o',
      ),
    ).toBe(true);
  });

  it('maps ERR_NO_RECORD to discovery guidance', () => {
    const discoveryFail: DiscoveryResult = {
      ok: false,
      error: Object.assign(new Error('No _agent TXT record found'), { errorCode: 'ERR_NO_RECORD' }),
    };
    const signal = buildDiscoveryResultSignal('example.com', discoveryFail);
    expect(signal.status).toBe('error');
    expect(signal.errorCode).toBe('ERR_NO_RECORD');
    expect(signal.hints?.join(' ')).toContain('_agent.example.com');
  });

  it('maps auth-required handshake into needs_auth signal', () => {
    const authError = new AuthRequiredError(
      'Authentication required',
      false,
      undefined,
      undefined,
      'pat',
    );
    const handshake: HandshakeResult = { ok: false, error: authError };
    const signal = buildConnectionResultSignal(discoveryContext(), handshake);

    expect(signal.stage).toBe('connection');
    expect(signal.status).toBe('needs_auth');
    expect(signal.title.toLowerCase()).toContain('authentication required');
  });

  it('shows Domain-bound in PKA detail when domainBound is true', () => {
    const result = discoveryOk();
    if (!result.ok) throw new Error('Expected successful discovery fixture');
    result.value.metadata.pka = {
      present: true,
      verified: true,
      domainBound: true,
      keyid: 'abc123',
    };

    const signal = buildDiscoveryResultSignal('example.com', result);
    const pkaDetail = signal.details?.find((d) => d.label === 'PKA');
    expect(pkaDetail).toBeDefined();
    expect(pkaDetail?.value).toContain('Domain-bound');
  });

  it('builds auth-retry success signal', () => {
    const handshake: HandshakeResult = {
      ok: true,
      value: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'Connected Server', version: '1.0.0' },
        capabilities: [{ id: 'tool.list', type: 'tool' }],
      },
    };

    const signal = buildAuthRetryResultSignal(discoveryContext(), handshake);
    expect(signal.stage).toBe('auth');
    expect(signal.status).toBe('success');
    expect(signal.summary).toContain('Connected');
  });
});
