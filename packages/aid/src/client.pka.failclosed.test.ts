import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discover } from './index.js';
import { webcrypto as nodeWebcrypto } from 'node:crypto';

// DNS returns a valid aid2 record carrying a PKA key (k). The endpoint proof
// must be honoured: a failed proof MUST fail discovery closed, not fall back to
// the .well-known trust path.
vi.mock('dns-query', () => ({
  query: vi.fn(),
}));

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

describe('PKA fail-closed (DNS-record proof must not fall back to .well-known)', () => {
  const g = globalThis as any;
  let origFetch: any;

  beforeEach(() => {
    origFetch = g.fetch;
  });
  afterEach(() => {
    g.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('rejects with ERR_SECURITY and does NOT fetch .well-known when the DNS-record PKA proof returns a malformed signature', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const x = b64url(rawPub);

    const { query } = await import('dns-query');
    (query as any).mockResolvedValue({
      rcode: 'NOERROR',
      answers: [
        {
          type: 'TXT',
          name: '_agent.example.com',
          data: `v=aid2;u=https://api.example.com/mcp;p=mcp;k=${x}`,
          ttl: 300,
        },
      ],
    });

    let wellKnownFetched = false;
    g.fetch = vi.fn(async (url: string) => {
      if (url.includes('/.well-known/agent')) {
        wellKnownFetched = true;
        // A perfectly valid (but DIFFERENT) record at the fallback path. If the
        // client fell open onto this, discovery would succeed — which is the bug.
        return {
          ok: true,
          status: 200,
          headers: {
            get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null),
          },
          text: async () =>
            JSON.stringify({ v: 'aid2', u: 'https://fallback.example.com/mcp', p: 'mcp' }),
        };
      }
      // Endpoint handshake: valid Signature-Input, but the Signature dictionary
      // member carries non-base64 bytes. atob would throw a DOMException.
      const created = Math.floor(Date.now() / 1000);
      const expires = created + 60;
      const params = `("@method";req "@target-uri";req "@authority";req "@status");created=${created};expires=${expires};keyid="x";alg="ed25519";nonce="n";tag="aid-pka-v2"`;
      return {
        ok: false,
        status: 200,
        headers: {
          get: (name: string) => {
            const k = name.toLowerCase();
            if (k === 'signature-input') return `aid-pka=${params}`;
            if (k === 'signature') return 'aid-pka=:@@@not-base64@@@:';
            if (k === 'cache-control') return 'no-store';
            return null;
          },
        },
        text: async () => '',
      };
    });

    await expect(discover('example.com', { wellKnownFallback: true })).rejects.toMatchObject({
      errorCode: 'ERR_SECURITY',
    });
    expect(wellKnownFetched).toBe(false);
  });
});
