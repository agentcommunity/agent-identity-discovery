import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Ed25519 private key for the pka-basic showcase example.
// This is a DEMO key — the corresponding public key is published in the
// _agent.pka-basic.agentcommunity.org TXT record.
const PRIVATE_KEY_B64 = 'MC4CAQAwBQYDK2VwBCIEIH1rQ69j3HkK7wAgjeYVxHCLWlcmFwpU7XS8L2u4zG71';
const LEGACY_KID = 'p1';
const PUBLIC_KEY_X = 'Eesj9h7MD0cRERrc_ICXu5Lb1WkokpkbWAkRcDsxUvA';
const KEYID = 'sYkYRKJfa8y8rCgWHb-qxqR4LY93c_hbbL10YbvT88o';

const COVERED_FIELDS = ['aid-challenge', '@method', '@target-uri', 'host', 'date'];
const V2_COVERED = '("@method";req "@target-uri";req "@authority";req "@status")';

let cachedKey: CryptoKey | null = null;

async function getPrivateKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const der = Buffer.from(PRIVATE_KEY_B64, 'base64');
  cachedKey = await globalThis.crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, [
    'sign',
  ]);
  return cachedKey;
}

function toBase64(buf: Uint8Array): string {
  return Buffer.from(buf).toString('base64');
}

function extractNonce(acceptSignature: string | null): string | null {
  if (!acceptSignature) return null;
  return /(?:^|;)\s*nonce="([^"]+)"/.exec(acceptSignature)?.[1] ?? null;
}

export async function GET(request: Request) {
  const acceptSignature = request.headers.get('accept-signature');
  const v2Nonce = extractNonce(acceptSignature);
  const challenge = request.headers.get('aid-challenge');
  const date = request.headers.get('date') || new Date().toUTCString();

  if (!challenge && !v2Nonce) {
    // Not a PKA handshake — return a simple JSON response describing the demo
    return NextResponse.json({
      service: 'AID PKA Demo',
      description:
        'This endpoint demonstrates AID Public Key Attestation (PKA). ' +
        'Send a GET request with Accept-Signature to perform the AID v2 handshake.',
      publicKey: PUBLIC_KEY_X,
      keyid: KEYID,
      spec: 'https://docs.agentcommunity.org/docs/reference/pka',
    });
  }

  const url = new URL(request.url);
  const targetUri = url.toString();
  const host = url.host;
  const method = 'GET';
  const nowSec = Math.floor(Date.now() / 1000);

  if (v2Nonce) {
    const status = 200;
    const expires = nowSec + 60;
    const authority = url.port
      ? `${url.hostname.toLowerCase()}:${url.port}`
      : url.hostname.toLowerCase();
    const sigInputValue = `${V2_COVERED};created=${nowSec};expires=${expires};keyid="${KEYID}";alg="ed25519";nonce="${v2Nonce}";tag="aid-pka-v2"`;
    const lines = [
      `"@method";req: ${method}`,
      `"@target-uri";req: ${targetUri}`,
      `"@authority";req: ${authority}`,
      `"@status": ${status}`,
      `"@signature-params": ${sigInputValue}`,
    ];
    const privateKey = await getPrivateKey();
    const sig = new Uint8Array(
      await globalThis.crypto.subtle.sign(
        'Ed25519',
        privateKey,
        new TextEncoder().encode(lines.join('\n')),
      ),
    );

    return new NextResponse(JSON.stringify({ ok: true, keyid: KEYID }), {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Signature-Input': `aid-pka=${sigInputValue}`,
        Signature: `aid-pka=:${toBase64(sig)}:`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'Signature, Signature-Input, Cache-Control',
      },
    });
  }

  // Build signature base per RFC 9421
  const lines = [
    `"AID-Challenge": ${challenge}`,
    `"@method": ${method}`,
    `"@target-uri": ${targetUri}`,
    `"host": ${host}`,
    `"date": ${date}`,
  ];
  const sigInputValue = `sig=("${COVERED_FIELDS.join('" "')}");created=${nowSec};keyid=${LEGACY_KID};alg="ed25519"`;
  lines.push(`"@signature-params": ${sigInputValue}`);
  const base = new TextEncoder().encode(lines.join('\n'));

  const privateKey = await getPrivateKey();
  const sig = new Uint8Array(await globalThis.crypto.subtle.sign('Ed25519', privateKey, base));

  return new NextResponse(JSON.stringify({ ok: true, kid: LEGACY_KID }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      Date: date,
      'Signature-Input': sigInputValue,
      Signature: `sig=:${toBase64(sig)}:`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'Signature, Signature-Input, Date',
    },
  });
}

// CORS preflight for browser PKA handshakes
export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'AID-Challenge, Date, Accept-Signature, Cache-Control',
      'Access-Control-Expose-Headers': 'Signature, Signature-Input, Date, Cache-Control',
      'Access-Control-Max-Age': '86400',
    },
  });
}
