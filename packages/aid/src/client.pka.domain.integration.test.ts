import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discover } from './index.js';
import { webcrypto as nodeWebcrypto } from 'node:crypto';

// Force DNS miss to drive the well-known fallback path
vi.mock('dns-query', () => ({
  query: vi.fn(async () => {
    const err: Error & { code?: string } = new Error('ENOTFOUND');
    err.code = 'ENOTFOUND';
    throw err;
  }),
}));

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

async function jwkThumbprint(x: string): Promise<string> {
  const input = `{"crv":"Ed25519","kty":"OKP","x":"${x}"}`;
  const digest = await nodeWebcrypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return b64url(new Uint8Array(digest));
}

describe('PKA domain binding integration', () => {
  const g = globalThis as any;
  let origFetch: any;

  beforeEach(() => {
    origFetch = g.fetch;
  });
  afterEach(() => {
    g.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('discovers an aid2 record and reports a domain-bound proof', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const x = b64url(rawPub);
    const keyid = await jwkThumbprint(x);
    let sawAidDomain: string | undefined;

    g.fetch = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (url.includes('/.well-known/agent')) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null),
          },
          text: async () =>
            JSON.stringify({ v: 'aid2', u: 'https://api.example.com/mcp', p: 'mcp', k: x }),
        };
      }
      sawAidDomain = init?.headers?.['AID-Domain'];
      const accept = init?.headers?.['Accept-Signature'] ?? '';
      const nonce = /nonce="([^"]+)"/.exec(accept)?.[1] ?? '';
      const created = Math.floor(Date.now() / 1000);
      const expires = created + 60;
      const params = `("@method";req "@target-uri";req "@authority";req "aid-domain";req "@status");created=${created};expires=${expires};keyid="${keyid}";alg="ed25519";nonce="${nonce}";tag="aid-pka-v2"`;
      const base = [
        `"@method";req: GET`,
        `"@target-uri";req: https://api.example.com/mcp`,
        `"@authority";req: api.example.com`,
        `"aid-domain";req: ${sawAidDomain}`,
        `"@status": 200`,
        `"@signature-params": ${params}`,
      ].join('\n');
      const sig = new Uint8Array(
        await nodeWebcrypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(base)),
      );
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            const k = name.toLowerCase();
            if (k === 'signature-input') return `aid-pka=${params}`;
            if (k === 'signature') return `aid-pka=:${Buffer.from(sig).toString('base64')}:`;
            if (k === 'cache-control') return 'no-store';
            return null;
          },
        },
        text: async () => '',
      };
    });

    const result = await discover('example.com', { wellKnownFallback: true });
    expect(sawAidDomain).toBe('example.com');
    expect(result.pka).toEqual({ domainBound: true });
  });

  it('fails discovery when the endpoint refuses domain binding', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const x = b64url(rawPub);

    g.fetch = vi.fn(async (url: string) => {
      if (url.includes('/.well-known/agent')) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null),
          },
          text: async () =>
            JSON.stringify({ v: 'aid2', u: 'https://api.example.com/mcp', p: 'mcp', k: x }),
        };
      }
      // Endpoint refuses to attest for the queried domain: 403 with no signature headers.
      return {
        ok: false,
        status: 403,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'cache-control' ? 'no-store' : null),
        },
        text: async () => '',
      };
    });

    await expect(discover('example.com', { wellKnownFallback: true })).rejects.toMatchObject({
      errorCode: 'ERR_SECURITY',
    });
  });

  it('require policy fails when the endpoint returns an unbound proof', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const x = b64url(rawPub);
    const keyid = await jwkThumbprint(x);

    g.fetch = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (url.includes('/.well-known/agent')) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null),
          },
          text: async () =>
            JSON.stringify({ v: 'aid2', u: 'https://api.example.com/mcp', p: 'mcp', k: x }),
        };
      }
      const created = Math.floor(Date.now() / 1000);
      const expires = created + 60;
      const accept = init?.headers?.['Accept-Signature'] ?? '';
      const nonce = /nonce="([^"]+)"/.exec(accept)?.[1] ?? '';
      const params = `("@method";req "@target-uri";req "@authority";req "@status");created=${created};expires=${expires};keyid="${keyid}";alg="ed25519";nonce="${nonce}";tag="aid-pka-v2"`;
      const base = [
        `"@method";req: GET`,
        `"@target-uri";req: https://api.example.com/mcp`,
        `"@authority";req: api.example.com`,
        `"@status": 200`,
        `"@signature-params": ${params}`,
      ].join('\n');
      const sig = new Uint8Array(
        await nodeWebcrypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(base)),
      );
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            const k = name.toLowerCase();
            if (k === 'signature-input') return `aid-pka=${params}`;
            if (k === 'signature') return `aid-pka=:${Buffer.from(sig).toString('base64')}:`;
            if (k === 'cache-control') return 'no-store';
            return null;
          },
        },
        text: async () => '',
      };
    });

    await expect(
      discover('example.com', { wellKnownFallback: true, domainBindingPolicy: 'require' }),
    ).rejects.toMatchObject({ errorCode: 'ERR_SECURITY' });
  });

  it('off policy does not send the AID-Domain header', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const x = b64url(rawPub);
    const keyid = await jwkThumbprint(x);
    let sawAidDomain: string | undefined = 'UNSET';

    g.fetch = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      if (url.includes('/.well-known/agent')) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null),
          },
          text: async () =>
            JSON.stringify({ v: 'aid2', u: 'https://api.example.com/mcp', p: 'mcp', k: x }),
        };
      }
      sawAidDomain = init?.headers?.['AID-Domain'];
      const created = Math.floor(Date.now() / 1000);
      const expires = created + 60;
      const accept = init?.headers?.['Accept-Signature'] ?? '';
      const nonce = /nonce="([^"]+)"/.exec(accept)?.[1] ?? '';
      const params = `("@method";req "@target-uri";req "@authority";req "@status");created=${created};expires=${expires};keyid="${keyid}";alg="ed25519";nonce="${nonce}";tag="aid-pka-v2"`;
      const base = [
        `"@method";req: GET`,
        `"@target-uri";req: https://api.example.com/mcp`,
        `"@authority";req: api.example.com`,
        `"@status": 200`,
        `"@signature-params": ${params}`,
      ].join('\n');
      const sig = new Uint8Array(
        await nodeWebcrypto.subtle.sign('Ed25519', kp.privateKey, new TextEncoder().encode(base)),
      );
      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            const k = name.toLowerCase();
            if (k === 'signature-input') return `aid-pka=${params}`;
            if (k === 'signature') return `aid-pka=:${Buffer.from(sig).toString('base64')}:`;
            if (k === 'cache-control') return 'no-store';
            return null;
          },
        },
        text: async () => '',
      };
    });

    await discover('example.com', { wellKnownFallback: true, domainBindingPolicy: 'off' });
    expect(sawAidDomain).toBeUndefined();
  });
});
