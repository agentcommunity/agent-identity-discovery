import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { GET, OPTIONS } from '@/app/api/pka-demo/route';

const PKA_DEMO_URL = 'https://aid.agentcommunity.org/api/pka-demo';
const ACCEPT_SIGNATURE =
  'aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created;expires;keyid="sYkYRKJfa8y8rCgWHb-qxqR4LY93c_hbbL10YbvT88o";alg="ed25519";nonce="test-nonce-123";tag="aid-pka-v2"';

const decodeSignatureHeader = (value: string): Uint8Array => {
  const encoded = value.match(/^aid-pka=:(.+):$/)?.[1];
  if (!encoded) throw new Error(`Invalid Signature header: ${value}`);
  return new Uint8Array(Buffer.from(encoded, 'base64'));
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const toBase64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64url').replaceAll('=', '');

const jwkThumbprint = (x: string): string =>
  createHash('sha256')
    .update(JSON.stringify({ crv: 'Ed25519', kty: 'OKP', x }))
    .digest('base64url');

describe('/api/pka-demo', () => {
  it('advertises a v2 public key whose keyid is the RFC7638 thumbprint', async () => {
    const response = await GET(new Request(PKA_DEMO_URL));
    const body = (await response.json()) as { publicKey: string; keyid: string };

    expect(response.status).toBe(200);
    expect(body.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(body.publicKey, 'base64url')).toHaveLength(32);
    expect(body.keyid).toBe(jwkThumbprint(body.publicKey));
  });

  it('returns a nonce-bound RFC 9421 response signature for AID v2 PKA', async () => {
    const infoResponse = await GET(new Request(PKA_DEMO_URL));
    const info = (await infoResponse.json()) as { publicKey: string };

    const response = await GET(
      new Request(PKA_DEMO_URL, {
        headers: { 'Accept-Signature': ACCEPT_SIGNATURE },
      }),
    );
    const body = (await response.json()) as { keyid: string };

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.keyid).toBe(jwkThumbprint(info.publicKey));

    const signatureInput = response.headers.get('Signature-Input');
    const signature = response.headers.get('Signature');
    expect(signatureInput).toContain('aid-pka=');
    expect(signatureInput).toContain('nonce="test-nonce-123"');
    expect(signatureInput).toContain('tag="aid-pka-v2"');
    expect(signature).toMatch(/^aid-pka=:.+:$/);

    const signatureParams = signatureInput?.replace(/^aid-pka=/, '');
    if (!signatureParams || !signature) throw new Error('Missing signature headers');

    const signatureBase = [
      '"@method";req: GET',
      `"@target-uri";req: ${PKA_DEMO_URL}`,
      '"@authority";req: aid.agentcommunity.org',
      '"@status": 200',
      `"@signature-params": ${signatureParams}`,
    ].join('\n');
    const key = await globalThis.crypto.subtle.importKey(
      'jwk',
      { kty: 'OKP', crv: 'Ed25519', x: info.publicKey },
      { name: 'Ed25519' },
      false,
      ['verify'],
    );

    await expect(
      globalThis.crypto.subtle.verify(
        'Ed25519',
        key,
        toArrayBuffer(decodeSignatureHeader(signature)),
        new TextEncoder().encode(signatureBase),
      ),
    ).resolves.toBe(true);
  });

  it('does not accept the legacy AID-Challenge handshake path', async () => {
    const response = await GET(
      new Request(PKA_DEMO_URL, {
        headers: { 'AID-Challenge': toBase64Url(new Uint8Array(32).fill(1)) },
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('Signature-Input')).toBeNull();
    expect(response.headers.get('Signature')).toBeNull();
  });

  it('preflights only the v2 PKA request headers', () => {
    const response = OPTIONS();

    expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
      'Accept-Signature, Cache-Control',
    );
    expect(response.headers.get('Access-Control-Expose-Headers')).toBe(
      'Signature, Signature-Input, Cache-Control',
    );
  });
});
