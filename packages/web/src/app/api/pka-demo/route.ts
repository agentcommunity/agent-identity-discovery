import { NextResponse } from 'next/server';
import { webcrypto } from 'node:crypto';

export const runtime = 'nodejs';

// Ed25519 private key for the pka-basic showcase example.
// This is a DEMO key — the corresponding public key is published in the
// _agent.pka-basic.agentcommunity.org TXT record.
const PRIVATE_KEY_B64 = 'MC4CAQAwBQYDK2VwBCIEIH1rQ69j3HkK7wAgjeYVxHCLWlcmFwpU7XS8L2u4zG71';
const KID = 'p1';

const COVERED_FIELDS = ['aid-challenge', '@method', '@target-uri', 'host', 'date'];

let cachedKey: webcrypto.CryptoKey | null = null;

async function getPrivateKey(): Promise<webcrypto.CryptoKey> {
  if (cachedKey) return cachedKey;
  const der = Buffer.from(PRIVATE_KEY_B64, 'base64');
  cachedKey = (await webcrypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, [
    'sign',
  ]));
  return cachedKey;
}

function toBase64(buf: Uint8Array): string {
  return Buffer.from(buf).toString('base64');
}

export async function GET(request: Request) {
  const challenge = request.headers.get('aid-challenge');
  const date = request.headers.get('date') || new Date().toUTCString();

  if (!challenge) {
    // Not a PKA handshake — return a simple JSON response describing the demo
    return NextResponse.json({
      service: 'AID PKA Demo',
      description:
        'This endpoint demonstrates AID Public Key Attestation (PKA). ' +
        'Send a GET request with an AID-Challenge header to perform the handshake.',
      kid: KID,
      spec: 'https://docs.agentcommunity.org/docs/Reference/identity_pka',
    });
  }

  const url = new URL(request.url);
  const targetUri = url.toString();
  const host = url.host;
  const method = 'GET';
  const nowSec = Math.floor(Date.now() / 1000);

  // Build signature base per RFC 9421
  const lines = [
    `"AID-Challenge": ${challenge}`,
    `"@method": ${method}`,
    `"@target-uri": ${targetUri}`,
    `"host": ${host}`,
    `"date": ${date}`,
  ];
  const sigInputValue = `sig=("${COVERED_FIELDS.join('" "')}");created=${nowSec};keyid=${KID};alg="ed25519"`;
  lines.push(`"@signature-params": ${sigInputValue}`);
  const base = new TextEncoder().encode(lines.join('\n'));

  const privateKey = await getPrivateKey();
  const sig = new Uint8Array(await webcrypto.subtle.sign('Ed25519', privateKey, base));

  return new NextResponse(JSON.stringify({ ok: true, kid: KID }), {
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
      'Access-Control-Allow-Headers': 'AID-Challenge, Date',
      'Access-Control-Expose-Headers': 'Signature, Signature-Input, Date',
      'Access-Control-Max-Age': '86400',
    },
  });
}
