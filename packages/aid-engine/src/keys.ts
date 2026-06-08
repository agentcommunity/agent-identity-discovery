import { webcrypto as nodeWebcrypto } from 'node:crypto';

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.includes('=')) return null;
  if (value.length % 4 === 1) return null;
  try {
    return new Uint8Array(Buffer.from(value, 'base64url'));
  } catch {
    return null;
  }
}

/**
 * Pure function that generates Ed25519 key pair without any side effects.
 * Returns the key data that can be used by consumers to handle storage.
 */
export async function generateEd25519KeyPair(): Promise<{
  publicKey: string;
  privateKeyPem: string;
  privateKeyBytes: Uint8Array;
}> {
  const kp = (await nodeWebcrypto.subtle.generateKey('Ed25519', true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
  const pkcs8 = new Uint8Array(await nodeWebcrypto.subtle.exportKey('pkcs8', kp.privateKey));
  const publicKey = toBase64Url(rawPub);
  const pem =
    '-----BEGIN PRIVATE KEY-----\n' +
    Buffer.from(pkcs8).toString('base64') +
    '\n-----END PRIVATE KEY-----\n';

  return {
    publicKey,
    privateKeyPem: pem,
    privateKeyBytes: pkcs8,
  };
}

export function verifyPka(pka: string): { valid: boolean; reason?: string } {
  if (!pka) return { valid: false, reason: 'Missing PKA key' };
  const decoded = decodeBase64Url(pka);
  if (!decoded) return { valid: false, reason: 'PKA must be unpadded base64url' };
  if (decoded.length !== 32) return { valid: false, reason: 'Unexpected key length' };
  return { valid: true };
}
