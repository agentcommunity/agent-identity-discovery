import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { performPKAHandshake } from './pka.js';
import * as fs from 'node:fs';
import * as nodeCrypto from 'node:crypto';
import * as path from 'node:path';

type V2Vector = {
  id: string;
  record: { v: 'aid2'; u: string; p: string; k: string };
  key: { seed_b64: string };
  request: {
    method: 'GET';
    target_uri: string;
    authority: string;
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

function loadV2Vector(id = 'v2-rfc9421-response-signature'): V2Vector {
  const p = path.resolve(process.cwd(), '..', '..', 'protocol', 'pka_vectors.json');
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw) as { vectors: Array<V2Vector | { id: string }> };
  const vector = parsed.vectors.find((item): item is V2Vector => {
    return item.id === id;
  });
  if (!vector) throw new Error(`missing v2 PKA vector: ${id}`);
  return vector;
}

function loadCanonicalV2Vector(): V2Vector {
  return loadV2Vector();
}

function duplicateParam(vector: V2Vector, param: 'nonce' | 'keyid' | 'alg'): string {
  const valueByParam = {
    nonce: `"${vector.nonce}"`,
    keyid: `"${vector.request.accept_signature.match(/keyid="([^"]+)"/)?.[1] ?? ''}"`,
    alg: '"ed25519"',
  };
  return vector.response.signature_input.replace(
    ';tag="aid-pka-v2"',
    `;${param}=${valueByParam[param]};tag="aid-pka-v2"`,
  );
}

function seedToPkcs8Ed25519(seed: Uint8Array): Uint8Array {
  const header = Uint8Array.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  const out = new Uint8Array(header.length + seed.length);
  out.set(header, 0);
  out.set(seed, header.length);
  return out;
}

function signV2Response(vector: V2Vector, signatureInput: string): string {
  const signatureParamsRaw = signatureInput.replace(/^aid-pka=/, '');
  const signatureBase = [
    `"@method";req: ${vector.request.method}`,
    `"@target-uri";req: ${vector.request.target_uri}`,
    `"@authority";req: ${vector.request.authority}`,
    `"@status": ${vector.response.status}`,
    `"@signature-params": ${signatureParamsRaw}`,
  ].join('\n');
  const seed = Buffer.from(vector.key.seed_b64, 'base64');
  const privateKey = nodeCrypto.createPrivateKey({
    key: seedToPkcs8Ed25519(seed),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = nodeCrypto.sign(null, new TextEncoder().encode(signatureBase), privateKey);
  return `aid-pka=:${Buffer.from(signature).toString('base64')}:`;
}

describe('AID v2 PKA handshake', () => {
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

  function mockSignedV2Response(vector: V2Vector, signatureInput: string): void {
    const signature = signV2Response(vector, signatureInput);
    const nonceBytes = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 160 + index));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(vector.created * 1000));
    getRandomValuesSpy = vi.spyOn(g.crypto!, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).set(nonceBytes);
      return array;
    });

    g.fetch = vi.fn(async () => ({
      ok: false,
      status: vector.response.status,
      headers: {
        get: (name: string) => {
          const normalized = name.toLowerCase();
          if (normalized === 'signature-input') return signatureInput;
          if (normalized === 'signature') return signature;
          if (normalized === 'cache-control') return vector.response.cache_control;
          return null;
        },
      },
      text: async () => '',
    }));
  }

  it('verifies the canonical nonce-bound RFC 9421 response signature vector', async () => {
    const vector = loadCanonicalV2Vector();
    const nonceBytes = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 160 + index));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(vector.created * 1000));
    getRandomValuesSpy = vi.spyOn(g.crypto!, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).set(nonceBytes);
      return array;
    });

    g.fetch = vi.fn(
      async (
        url: string,
        init?: { method?: string; redirect?: string; headers?: Record<string, string> },
      ) => {
        expect(url).toBe(vector.request.target_uri);
        expect(init?.method).toBe(vector.request.method);
        expect(init?.redirect).toBe('error');
        expect(init?.headers?.['Accept-Signature']).toBe(vector.request.accept_signature);
        expect(init?.headers?.['Cache-Control']).toBe(vector.request.cache_control);
        expect(init?.headers).not.toHaveProperty('AID-Challenge');
        expect(init?.headers).not.toHaveProperty('Date');

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
      },
    );

    await expect(performPKAHandshake(vector.record.u, vector.record.k)).resolves.toEqual({
      domainBound: false,
    });
  });

  it('canonicalizes uppercase hosts, default ports, query, and fragments for @target-uri', async () => {
    const vector = loadV2Vector('v2-uppercase-host-default-port-canonical-target');
    const nonceBytes = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 160 + index));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(vector.created * 1000));
    getRandomValuesSpy = vi.spyOn(g.crypto!, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).set(nonceBytes);
      return array;
    });

    g.fetch = vi.fn(
      async (
        url: string,
        init?: { method?: string; redirect?: string; headers?: Record<string, string> },
      ) => {
        expect(url).toBe(vector.request.target_uri);
        expect(init?.method).toBe(vector.request.method);
        expect(init?.headers?.['Accept-Signature']).toBe(vector.request.accept_signature);

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
      },
    );

    await expect(performPKAHandshake(vector.record.u, vector.record.k)).resolves.toEqual({
      domainBound: false,
    });
  });

  it('rejects aid2 PKA responses without Cache-Control: no-store', async () => {
    const vector = loadCanonicalV2Vector();
    const nonceBytes = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 160 + index));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(vector.created * 1000));
    getRandomValuesSpy = vi.spyOn(g.crypto!, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).set(nonceBytes);
      return array;
    });

    g.fetch = vi.fn(async () => ({
      ok: false,
      status: vector.response.status,
      headers: {
        get: (name: string) => {
          const normalized = name.toLowerCase();
          if (normalized === 'signature-input') return vector.response.signature_input;
          if (normalized === 'signature') return vector.response.signature;
          if (normalized === 'cache-control') return 'public, max-age=60';
          return null;
        },
      },
      text: async () => '',
    }));

    await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toMatchObject({
      errorCode: 'ERR_SECURITY',
    });
  });

  it.each(['nonce', 'keyid', 'alg'] as const)(
    'rejects duplicate %s Signature-Input parameters',
    async (param) => {
      const vector = loadCanonicalV2Vector();
      const signatureInput = duplicateParam(vector, param);
      mockSignedV2Response(vector, signatureInput);

      await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toThrow(
        `Duplicate Signature-Input parameter: ${param}`,
      );
    },
  );

  it.each(['Created', 'KeyID'] as const)(
    'rejects mixed-case %s Signature-Input parameter names',
    async (param) => {
      const vector = loadCanonicalV2Vector();
      const canonicalParam = param === 'Created' ? 'created' : 'keyid';
      const signatureInput = vector.response.signature_input.replace(
        `;${canonicalParam}=`,
        `;${param}=`,
      );
      mockSignedV2Response(vector, signatureInput);

      await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toThrow(
        `Unsupported Signature-Input parameter: ${param}`,
      );
    },
  );

  it.each(['created', 'expires'] as const)(
    'rejects quoted %s Signature-Input timestamp parameters',
    async (param) => {
      const vector = loadCanonicalV2Vector();
      const value = param === 'created' ? vector.created : vector.expires;
      const signatureInput = vector.response.signature_input.replace(
        `;${param}=${value}`,
        `;${param}="${value}"`,
      );
      mockSignedV2Response(vector, signatureInput);

      await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toThrow(
        'Invalid Signature-Input timestamp',
      );
    },
  );

  it('rejects duplicate aid-pka Signature-Input dictionary members', async () => {
    const vector = loadCanonicalV2Vector();
    const nonceBytes = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 160 + index));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(vector.created * 1000));
    getRandomValuesSpy = vi.spyOn(g.crypto!, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).set(nonceBytes);
      return array;
    });

    g.fetch = vi.fn(async () => ({
      ok: false,
      status: vector.response.status,
      headers: {
        get: (name: string) => {
          const normalized = name.toLowerCase();
          if (normalized === 'signature-input') {
            return `${vector.response.signature_input}, ${vector.response.signature_input}`;
          }
          if (normalized === 'signature') return vector.response.signature;
          if (normalized === 'cache-control') return vector.response.cache_control;
          return null;
        },
      },
      text: async () => '',
    }));

    await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toThrow(
      'Duplicate aid-pka signature member',
    );
  });

  it.each(['AID-PKA', 'Aid-Pka'] as const)(
    'rejects exact-plus-mixed %s Signature-Input dictionary members',
    async (member) => {
      const vector = loadCanonicalV2Vector();
      const nonceBytes = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 160 + index));
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(vector.created * 1000));
      getRandomValuesSpy = vi.spyOn(g.crypto!, 'getRandomValues').mockImplementation((array) => {
        (array as Uint8Array).set(nonceBytes);
        return array;
      });

      const caseConfusedSignatureInput = vector.response.signature_input.replace(
        /^aid-pka=/,
        `${member}=`,
      );

      g.fetch = vi.fn(async () => ({
        ok: false,
        status: vector.response.status,
        headers: {
          get: (name: string) => {
            const normalized = name.toLowerCase();
            if (normalized === 'signature-input') {
              return `${vector.response.signature_input}, ${caseConfusedSignatureInput}`;
            }
            if (normalized === 'signature') return vector.response.signature;
            if (normalized === 'cache-control') return vector.response.cache_control;
            return null;
          },
        },
        text: async () => '',
      }));

      await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toThrow(
        'Duplicate aid-pka signature member',
      );
    },
  );

  it('rejects duplicate aid-pka Signature dictionary members', async () => {
    const vector = loadCanonicalV2Vector();
    const nonceBytes = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 160 + index));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(vector.created * 1000));
    getRandomValuesSpy = vi.spyOn(g.crypto!, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).set(nonceBytes);
      return array;
    });

    g.fetch = vi.fn(async () => ({
      ok: false,
      status: vector.response.status,
      headers: {
        get: (name: string) => {
          const normalized = name.toLowerCase();
          if (normalized === 'signature-input') return vector.response.signature_input;
          if (normalized === 'signature') {
            return `${vector.response.signature}, ${vector.response.signature}`;
          }
          if (normalized === 'cache-control') return vector.response.cache_control;
          return null;
        },
      },
      text: async () => '',
    }));

    await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toThrow(
      'Duplicate aid-pka signature member',
    );
  });

  it.each(['AID-PKA', 'Aid-Pka'] as const)(
    'rejects exact-plus-mixed %s Signature dictionary members',
    async (member) => {
      const vector = loadCanonicalV2Vector();
      const nonceBytes = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 160 + index));
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(vector.created * 1000));
      getRandomValuesSpy = vi.spyOn(g.crypto!, 'getRandomValues').mockImplementation((array) => {
        (array as Uint8Array).set(nonceBytes);
        return array;
      });

      const caseConfusedSignature = vector.response.signature.replace(/^aid-pka=/, `${member}=`);

      g.fetch = vi.fn(async () => ({
        ok: false,
        status: vector.response.status,
        headers: {
          get: (name: string) => {
            const normalized = name.toLowerCase();
            if (normalized === 'signature-input') return vector.response.signature_input;
            if (normalized === 'signature') {
              return `${vector.response.signature}, ${caseConfusedSignature}`;
            }
            if (normalized === 'cache-control') return vector.response.cache_control;
            return null;
          },
        },
        text: async () => '',
      }));

      await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toThrow(
        'Duplicate aid-pka signature member',
      );
    },
  );

  it.each([
    ['duplicate req parameter', '"@method";req;req'],
    ['uppercase req parameter', '"@method";REQ'],
    ['mixed-case req parameter', '"@method";ReQ'],
    ['unknown covered item parameter', '"@method";req;foo'],
  ])('rejects %s on covered items', async (_name, replacement) => {
    const vector = loadCanonicalV2Vector();
    const signatureInput = vector.response.signature_input.replace('"@method";req', replacement);
    mockSignedV2Response(vector, signatureInput);

    await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toThrow(
      /Signature-Input covered item/,
    );
  });

  it.each([
    [
      'duplicate covered item names',
      (input: string) => input.replace('"@authority";req', '"@method";req'),
      /Signature-Input must cover required fields/,
    ],
    [
      'missing required covered item',
      (input: string) => input.replace(' "@authority";req', ''),
      /Signature-Input must cover required fields/,
    ],
    [
      'date as an extra covered field',
      (input: string) => input.replace('"@status"', '"date"'),
      /Unsupported covered field: date/,
    ],
    [
      'mixed-case covered component name',
      (input: string) => input.replace('"@method";req', '"@Method";req'),
      /Unsupported covered field: @Method/,
    ],
  ])('rejects %s', async (_name, mutate, message) => {
    const vector = loadCanonicalV2Vector();
    const signatureInput = mutate(vector.response.signature_input);
    mockSignedV2Response(vector, signatureInput);

    await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toThrow(message);
  });

  it('rejects unknown Signature-Input parameters', async () => {
    const vector = loadCanonicalV2Vector();
    const signatureInput = vector.response.signature_input.replace(
      ';tag="aid-pka-v2"',
      ';tag="aid-pka-v2";foo="bar"',
    );
    mockSignedV2Response(vector, signatureInput);

    await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toThrow(
      'Unsupported Signature-Input parameter: foo',
    );
  });

  it('rejects a malformed (non-base64) Signature value with ERR_SECURITY (not a raw DOMException)', async () => {
    const vector = loadCanonicalV2Vector();
    const nonceBytes = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 160 + index));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(vector.created * 1000));
    getRandomValuesSpy = vi.spyOn(g.crypto!, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).set(nonceBytes);
      return array;
    });

    // Valid Signature-Input, but the Signature dictionary member carries
    // non-base64 bytes between the colons. atob would throw a DOMException;
    // the handshake must surface a structured ERR_SECURITY AidError so the
    // client fails closed instead of treating it as a DNS lookup failure.
    g.fetch = vi.fn(async () => ({
      ok: false,
      status: vector.response.status,
      headers: {
        get: (name: string) => {
          const normalized = name.toLowerCase();
          if (normalized === 'signature-input') return vector.response.signature_input;
          if (normalized === 'signature') return 'aid-pka=:@@@not-base64@@@:';
          if (normalized === 'cache-control') return vector.response.cache_control;
          return null;
        },
      },
      text: async () => '',
    }));

    await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toMatchObject({
      name: 'AidError',
      errorCode: 'ERR_SECURITY',
    });
    await expect(performPKAHandshake(vector.record.u, vector.record.k)).rejects.toThrow(
      'Invalid PKA signature encoding',
    );
  });
});
