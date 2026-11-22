// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { runModelMarketInterop } from './modelmarket';

vi.mock('@agentcommunity/aid', async (importOriginal) => {
  const aid = await importOriginal<typeof import('@agentcommunity/aid')>();
  return {
    ...aid,
    performPKAHandshake: vi.fn<typeof aid.performPKAHandshake>(
      async (uri, _pka, _kid, domain, fetch) => {
        if (!fetch) throw new Error('Expected an injected fetch');
        const response = await fetch(uri, {
          headers: domain ? { 'AID-Domain': domain } : {},
          redirect: 'error',
        });
        if (!response.headers.get('Signature')) throw new Error('Missing signature headers');
        return { domainBound: domain === 'modelmarket.dev' };
      },
    ),
  };
});

const domain = 'modelmarket.dev';
const endpoint = 'https://modelmarket.dev/mcp';
const cardUrl = 'https://modelmarket.dev/mcp/server-card';
const card = JSON.stringify({ remotes: [{ type: 'streamable-http', url: endpoint }] });
const digest = 'sha256:' + createHash('sha256').update(card).digest('hex');
const key = 'JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs';

function mockFetch({
  negativeStatus = 403,
  cardStatus = 200,
  negativeSigned = false,
  cardBody = card,
  cardDigest = digest,
  cardLocation = cardUrl,
  recordUri = endpoint,
} = {}) {
  function responseFor(input: RequestInfo | URL, init?: RequestInit) {
    const url = input instanceof Request ? input.url : input.toString();
    if (url.startsWith('https://dns.google/resolve?')) {
      return Response.json({
        Status: 0,
        Answer: [
          {
            name: '_agent.modelmarket.dev.',
            type: 16,
            data: `"v=aid2;p=mcp;" "u=${recordUri};k=${key}"`,
          },
        ],
      });
    }
    if (url === endpoint) {
      const binding = new Headers(init?.headers).get('AID-Domain');
      if (binding && binding !== domain) {
        return new Response(null, {
          status: negativeStatus,
          headers: negativeSigned ? { Signature: 'unexpected' } : {},
        });
      }
      return new Response(null, { headers: { Signature: 'fixture' } });
    }
    if (url === `https://${domain}/.well-known/ard.json`) {
      return Response.json({
        entries: [
          {
            identifier: 'urn:air:modelmarket.dev:mcp:gateway',
            type: 'application/mcp-server-card+json',
            url: cardLocation,
            digest: cardDigest,
          },
        ],
      });
    }
    if (url === cardUrl) return new Response(cardBody, { status: cardStatus });
    throw new Error('Unexpected request: ' + url);
  }
  return vi.fn<typeof fetch>((input, init) => Promise.resolve(responseFor(input, init)));
}

describe('ModelMarket interop', () => {
  it('reports each live outcome and both distinct stale fixture results', async () => {
    const report = await runModelMarketInterop(mockFetch());
    expect(report.live.map(({ id, passed }) => [id, passed])).toEqual([
      ['unbound', true],
      ['bound', true],
      ['wrong-domain', true],
      ['card-digest', true],
    ]);
    expect(report.live[2]).toMatchObject({ httpStatus: 403, verified: false });
    expect(report.fixtures).toMatchObject([
      { passed: true, observed: 'endpoint-mismatch' },
      { passed: true, observed: 'card-digest-mismatch' },
    ]);
  });

  it.each([{ negativeStatus: 500 }, { negativeSigned: true }])(
    'rejects an unexpected wrong-domain response (%o)',
    async (options) => {
      const report = await runModelMarketInterop(mockFetch(options));
      expect(report.live[2]).toMatchObject({ passed: false });
    },
  );

  it('requests manual redirect handling for HTTP calls and rejects a redirected card', async () => {
    const fetch = mockFetch({ cardStatus: 302 });
    const report = await runModelMarketInterop(fetch);
    expect(fetch).toHaveBeenCalledTimes(6);
    for (const [, init] of fetch.mock.calls) {
      expect(init?.redirect).toBe('manual');
    }
    expect(report.live[3]).toMatchObject({
      passed: false,
      observed: `HTTP 302 fetching ${cardUrl}`,
    });
  });

  it('reports an oversized card without losing the proof results', async () => {
    const report = await runModelMarketInterop(mockFetch({ cardBody: 'x'.repeat(1024 ** 2 + 1) }));
    expect(report.live.map(({ passed }) => passed)).toEqual([true, true, true, false]);
    expect(report.live[3]).toMatchObject({
      observed: `Response exceeded 1 MiB fetching ${cardUrl}`,
    });
  });

  it('keeps the proof results when only the live digest fails', async () => {
    const report = await runModelMarketInterop(mockFetch({ cardBody: card + '\n' }));
    expect(report.live.map(({ passed }) => passed)).toEqual([true, true, true, false]);
    expect(report.live[3]).toMatchObject({ observed: 'card-digest-mismatch' });
  });

  it('reports an endpoint mismatch only after verifying the new card digest', async () => {
    const cardEndpoint = endpoint + '-old';
    const cardBody = JSON.stringify({
      remotes: [
        { type: 'sse', url: endpoint },
        { type: 'streamable-http', url: cardEndpoint },
      ],
    });
    const cardDigest = 'sha256:' + createHash('sha256').update(cardBody).digest('hex');
    const report = await runModelMarketInterop(mockFetch({ cardBody, cardDigest }));
    expect(report.live[3]).toMatchObject({
      passed: false,
      observed: 'endpoint-mismatch',
      expectedEndpoint: endpoint,
      cardEndpoints: [cardEndpoint],
      actualDigest: cardDigest,
    });
  });

  it('rejects unexpected upstream URLs before starting any checks against them', async () => {
    const fetch = mockFetch({
      recordUri: 'https://elsewhere.example/mcp',
      cardLocation: 'https://elsewhere.example/card',
    });
    const report = await runModelMarketInterop(fetch);
    expect(report.live.map(({ passed }) => passed)).toEqual([false, false, false, false]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
