import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discover } from './index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as nodeCrypto from 'node:crypto';

// Force DNS miss to drive well-known fallback path
vi.mock('dns-query', () => {
  return {
    query: vi.fn(async () => {
      const err: any = new Error('ENOTFOUND');
      err.code = 'ENOTFOUND';
      throw err;
    }),
  };
});

function loadVectors() {
  const p = path.resolve(process.cwd(), '..', '..', 'protocol', 'pka_vectors.json');
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw) as {
    version: number;
    vectors: Array<{
      id: string;
      desc: string;
      record: { v: string; u: string; p: string; i: string };
      key: { public: string; seed_b64: string };
      covered: string[];
      created: number;
      httpDate?: string;
      overrideAlg?: string;
      overrideKeyId?: string;
      expect: 'pass' | 'fail';
    }>;
  };
}

function seedToPkcs8Ed25519(seed: Uint8Array): Uint8Array {
  // PKCS#8 structure for Ed25519 private key (RFC 8410)
  // 30 2e 02 01 00 30 05 06 03 2b 65 70 04 22 04 20 || 32-byte seed
  const header = Uint8Array.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  const out = new Uint8Array(header.length + seed.length);
  out.set(header, 0);
  out.set(seed, header.length);
  return out;
}

function b58encode(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const size = Math.ceil((bytes.length * Math.log(256)) / Math.log(58)) + 1;
  const b = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    let j = size - 1;
    while (carry !== 0 || j >= size - length) {
      carry += 256 * b[j];
      b[j] = carry % 58;
      carry = Math.floor(carry / 58);
      j--;
    }
    length = size - 1 - j;
  }
  let it = size - length;
  while (it < size && b[it] === 0) it++;
  let out = '1'.repeat(zeros);
  for (let i = it; i < size; i++) out += ALPHABET[b[i]];
  return out;
}

function extractEd25519PublicFromSpki(spkiDer: Uint8Array): Uint8Array {
  // Ed25519 SPKI ends with BIT STRING of 0x21 0x00 + 32 bytes public key; extract last 32 bytes
  return spkiDer.subarray(spkiDer.length - 32);
}

describe('PKA vectors parity (TS)', () => {
  const g = globalThis as any;
  let origFetch: any;

  beforeEach(() => {
    origFetch = g.fetch;
  });
  afterEach(() => {
    g.fetch = origFetch;
    vi.restoreAllMocks();
  });

  for (const v of loadVectors().vectors.filter((vector) => vector.record.v === 'aid1')) {
    it(`${v.id}: ${v.desc}`, async () => {
      const seed = Buffer.from(v.key.seed_b64, 'base64');
      const pkcs8 = seedToPkcs8Ed25519(seed);
      const priv = nodeCrypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
      const pub = nodeCrypto
        .createPublicKey(priv)
        .export({ type: 'spki', format: 'der' }) as Buffer;
      const rawPub = extractEd25519PublicFromSpki(new Uint8Array(pub));
      const pka = 'z' + b58encode(rawPub);

      g.fetch = vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
        if (url.includes('/.well-known/agent')) {
          return {
            ok: true,
            status: 200,
            headers: {
              get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null),
            },
            text: async () =>
              JSON.stringify({
                v: v.record.v,
                u: v.record.u,
                p: v.record.p,
                k: pka,
                i: v.record.i,
              }),
          };
        }
        // Handshake
        const order = v.covered;
        const challenge = init?.headers?.['AID-Challenge'] ?? '';
        const requestDate = init?.headers?.['Date'] ?? '';
        const date = v.expect === 'pass' ? requestDate : (v.httpDate ?? requestDate);
        const method = 'GET';
        const target = url;
        const host = new URL(url).host;
        const lines: string[] = [];
        for (const item of order) {
          switch (item) {
            case 'AID-Challenge':
              lines.push(`"AID-Challenge": ${challenge}`);
              break;
            case '@method':
              lines.push(`"@method": ${method}`);
              break;
            case '@target-uri':
              lines.push(`"@target-uri": ${target}`);
              break;
            case 'host':
              lines.push(`"host": ${host}`);
              break;
            case 'date':
              lines.push(`"date": ${date}`);
              break;
            default:
              throw new Error('unexpected covered item: ' + item);
          }
        }
        const keyid = v.overrideKeyId ?? v.record.i;
        const alg = v.overrideAlg ?? 'ed25519';
        const nowSec = Math.floor(Date.now() / 1000);
        const usedCreated = v.expect === 'pass' ? nowSec : v.created;
        const paramsStr = `(${order.map((c) => `"${c}"`).join(' ')});created=${usedCreated};keyid=${keyid};alg="${alg}"`;
        lines.push(`"@signature-params": ${paramsStr}`);
        const base = new TextEncoder().encode(lines.join('\n'));
        const sig = nodeCrypto.sign(null, base, priv);
        const headers = {
          get: (name: string) => {
            const k = name.toLowerCase();
            if (k === 'signature-input')
              return `sig=("${order.join('" "')}");created=${usedCreated};keyid=${keyid};alg="${alg}"`;
            if (k === 'signature') return `sig=:${Buffer.from(sig).toString('base64')}:`;
            if (k === 'date') return date;
            return null;
          },
        };
        return { ok: true, status: 200, headers, text: async () => '' };
      });

      if (v.expect === 'pass') {
        const { record } = await discover('example.com', { wellKnownFallback: true });
        expect(record.pka).toBeDefined();
      } else {
        await expect(discover('example.com', { wellKnownFallback: true })).rejects.toMatchObject({
          errorCode: 'ERR_SECURITY',
        });
      }
    });
  }
});
