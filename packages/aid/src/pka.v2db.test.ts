import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canonicalizeAidDomain, performPKAHandshake } from './pka.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

type DbVector = {
  id: string;
  record: { v: 'aid2'; u: string; p: string; k: string };
  domain?: string;
  request: {
    method: 'GET';
    target_uri: string;
    authority: string;
    aid_domain?: string;
    accept_signature: string;
    cache_control: string;
  };
  response: {
    status: number;
    cache_control: string;
    signature_input: string;
    signature: string;
  };
  created: number;
  expires: number;
  nonce: string;
  expect: 'pass' | 'fail';
};

function loadVector(id: string): DbVector {
  const p = path.resolve(process.cwd(), '..', '..', 'protocol', 'pka_vectors.json');
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw) as { vectors: Array<DbVector | { id: string }> };
  const vector = parsed.vectors.find((item): item is DbVector => item.id === id);
  if (!vector) throw new Error(`missing PKA vector: ${id}`);
  return vector;
}

describe('AID v2 PKA domain binding', () => {
  const g = globalThis as unknown as {
    fetch?: unknown;
    crypto?: Crypto & { getRandomValues: Crypto['getRandomValues'] };
  };
  let originalFetch: unknown;
  let getRandomValuesSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    originalFetch = g.fetch;
  });

  afterEach(() => {
    g.fetch = originalFetch;
    getRandomValuesSpy?.mockRestore();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function mockVectorResponse(
    vector: DbVector,
    // eslint-disable-next-line no-unused-vars -- parameter names in a type annotation
    assertRequest?: (url: string, init?: { headers?: Record<string, string> }) => void,
  ): void {
    const nonceBytes = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 160 + index));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(vector.created * 1000));
    getRandomValuesSpy = vi.spyOn(g.crypto!, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).set(nonceBytes);
      return array;
    });

    g.fetch = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      assertRequest?.(url, init);
      return {
        ok: false,
        status: vector.response.status,
        headers: {
          get: (name: string) => {
            const normalized = name.toLowerCase();
            if (normalized === 'signature-input') return vector.response.signature_input;
            if (normalized === 'signature') return vector.response.signature;
            if (normalized === 'cache-control') return vector.response.cache_control;
            return null;
          },
        },
        text: async () => '',
      };
    });
  }

  it('verifies the canonical domain-bound vector and reports domainBound', async () => {
    const vector = loadVector('v2-db-rfc9421-domain-bound');
    mockVectorResponse(vector, (url, init) => {
      expect(url).toBe(vector.request.target_uri);
      expect(init?.headers?.['AID-Domain']).toBe(vector.request.aid_domain);
      expect(init?.headers?.['Accept-Signature']).toBe(vector.request.accept_signature);
    });

    await expect(
      performPKAHandshake(vector.record.u, vector.record.k, undefined, vector.domain),
    ).resolves.toEqual({ domainBound: true });
  });

  it('accepts a plain v2 response to a domain-bound request and reports domainBound=false', async () => {
    const vector = loadVector('v2-rfc9421-response-signature');
    mockVectorResponse(vector);

    await expect(
      performPKAHandshake(vector.record.u, vector.record.k, undefined, 'example.com'),
    ).resolves.toEqual({ domainBound: false });
  });

  it('rejects a db-tagged response that does not cover aid-domain', async () => {
    const vector = loadVector('v2-db-missing-aid-domain-coverage');
    mockVectorResponse(vector);

    await expect(
      performPKAHandshake(vector.record.u, vector.record.k, undefined, vector.domain),
    ).rejects.toThrow('Signature-Input must cover required fields');
  });

  it('rejects a plain aid-pka-v2 response that covers aid-domain', async () => {
    const vector = loadVector('v2-rfc9421-response-signature');
    const tampered: typeof vector = {
      ...vector,
      response: {
        ...vector.response,
        signature_input: vector.response.signature_input.replace(
          '"@authority";req ',
          '"@authority";req "aid-domain";req ',
        ),
      },
    };
    mockVectorResponse(tampered);

    await expect(
      performPKAHandshake(tampered.record.u, tampered.record.k, undefined, 'example.com'),
    ).rejects.toThrow('Signature-Input must cover required fields');
  });

  it('rejects an unrequested domain-bound response', async () => {
    const vector = loadVector('v2-db-rfc9421-domain-bound');
    mockVectorResponse(vector);

    await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toThrow(
      'Unrequested domain-bound signature tag',
    );
  });

  it('rejects when the signed domain differs from the sent domain', async () => {
    const vector = loadVector('v2-db-rfc9421-domain-bound');
    mockVectorResponse(vector);

    await expect(
      performPKAHandshake(vector.record.u, vector.record.k, undefined, 'evil.example'),
    ).rejects.toThrow('PKA signature verification failed');
  });

  it('canonicalizes AID-Domain values', () => {
    expect(canonicalizeAidDomain(' Example.COM. ')).toBe('example.com');
    expect(canonicalizeAidDomain('127.0.0.1')).toBe('127.0.0.1');
    expect(() => canonicalizeAidDomain('bad domain')).toThrow('Invalid AID-Domain value');
    expect(() => canonicalizeAidDomain('')).toThrow('Invalid AID-Domain value');
  });
});
