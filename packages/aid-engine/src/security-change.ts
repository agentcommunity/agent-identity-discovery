import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import type { CacheEntry } from './types';

// --- PKA key identity helpers (single source of truth shared by the engine
// checker and the aid-doctor cache, which re-exports from here) ---

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodeBase58(value: string): Uint8Array | null {
  let leadingZeros = 0;
  for (const char of value) {
    if (char !== '1') break;
    leadingZeros += 1;
  }
  if (leadingZeros === value.length) {
    return new Uint8Array(leadingZeros);
  }

  const bytes = [0];
  for (const char of value.slice(leadingZeros)) {
    const valueIndex = BASE58_ALPHABET.indexOf(char);
    if (valueIndex === -1) return null;
    let carry = valueIndex;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const decoded = bytes.reverse();
  return new Uint8Array([...new Array<number>(leadingZeros).fill(0), ...decoded]);
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.includes('=') || value.length % 4 === 1) {
    return null;
  }
  try {
    return new Uint8Array(Buffer.from(value, 'base64url'));
  } catch {
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/**
 * Derive an Ed25519 RFC 7638 JWK thumbprint (keyid) and the canonical base64url
 * JWK `x` value from either an aid1 legacy `z`-prefixed base58btc key or an aid2
 * base64url JWK `x` key.
 */
export function derivePkaKeyid(
  pka: string | null | undefined,
): { keyid: string; jwkX: string } | null {
  if (!pka) return null;
  const publicKey = pka.startsWith('z') ? decodeBase58(pka.slice(1)) : decodeBase64Url(pka);
  if (!publicKey || publicKey.length !== 32) return null;

  const jwkX = toBase64Url(publicKey);
  const thumbprintInput = `{"crv":"Ed25519","kty":"OKP","x":"${jwkX}"}`;
  return {
    jwkX,
    keyid: createHash('sha256').update(thumbprintInput).digest('base64url'),
  };
}

export type SecurityChangeStatus =
  | 'first_seen'
  | 'no_change'
  | 'pka_added'
  | 'pka_removed'
  | 'key_replaced'
  | 'version_downgrade'
  | 'binding_loss'
  | 'fallback_well_known_tls';

/**
 * Classify the security-state transition between a previously cached entry and
 * the current discovery. This is the single source of truth used by both the
 * engine checker and the aid-doctor cache (which re-exports it).
 */
export function classifySecurityChange(
  previous: CacheEntry | null | undefined,
  current: CacheEntry,
): SecurityChangeStatus {
  if (current.trustSource === 'well-known-tls') {
    return 'fallback_well_known_tls';
  }

  if (!previous) return 'first_seen';

  if (previous.version === 'aid2' && current.version === 'aid1') {
    return 'version_downgrade';
  }

  const previousHasPka = Boolean(previous.pka || previous.keyid);
  const currentHasPka = Boolean(current.pka || current.keyid);
  if (!previousHasPka && currentHasPka) return 'pka_added';
  if (previousHasPka && !currentHasPka) return 'pka_removed';

  const previousKey = previous.keyid ?? derivePkaKeyid(previous.pka)?.keyid ?? previous.pka;
  const currentKey = current.keyid ?? derivePkaKeyid(current.pka)?.keyid ?? current.pka;
  if (previousKey && currentKey && previousKey !== currentKey) {
    return 'key_replaced';
  }

  // Binding loss is warning-only. Keep it AFTER the fail-eligible branches above so
  // it can never mask a higher-severity downgrade (key replacement, version drop,
  // pka removal) — otherwise it would open a downgrade-evasion path.
  if (previous.domainBound === true && current.domainBound === false) {
    return 'binding_loss';
  }

  return 'no_change';
}
