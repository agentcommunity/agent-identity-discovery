import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { discover } from './index.js';
import { webcrypto as nodeWebcrypto } from 'node:crypto';

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

function toBase64(buf: Uint8Array): string {
  return Buffer.from(buf).toString('base64');
}

describe('PKA integration (Ed25519 handshake)', () => {
  const g = globalThis as any;
  let origFetch: any;

  beforeEach(() => {
    origFetch = g.fetch;
  });
  afterEach(() => {
    g.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it('accepts a valid signature covering required fields', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const pka = 'z' + b58encode(rawPub);

    const nowSec = Math.floor(Date.now() / 1000);
    const kid = 'g1';
    const order = ['AID-Challenge', '@method', '@target-uri', 'host', 'date'];

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
              v: 'aid1',
              u: 'https://api.example.com/mcp',
              p: 'mcp',
              k: pka,
              i: kid,
            }),
        };
      }
      // Handshake fetch: sign base over covered fields
      const challenge = init?.headers?.['AID-Challenge'] ?? '';
      const _date = init?.headers?.['Date'] ?? '';
      const method = 'GET';
      const _target = url;
      const _host = new URL(url).host;
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
            lines.push(`"@target-uri": ${_target}`);
            break;
          case 'host':
            lines.push(`"host": ${_host}`);
            break;
          case 'date':
            lines.push(`"date": ${_date}`);
            break;
          default:
            throw new Error('unexpected covered item');
        }
      }
      const paramsStr = `(${order.map((c) => `"${c}"`).join(' ')});created=${nowSec};keyid=${kid};alg="ed25519"`;
      lines.push(`"@signature-params": ${paramsStr}`);
      const base = new TextEncoder().encode(lines.join('\n'));
      const sig = new Uint8Array(await nodeWebcrypto.subtle.sign('Ed25519', kp.privateKey, base));

      const headers = {
        get: (name: string) => {
          const k = name.toLowerCase();
          if (k === 'signature-input')
            return `sig=("${order.join('" "')}");created=${nowSec};keyid=${kid};alg="ed25519"`;
          if (k === 'signature') return `sig=:${toBase64(sig)}:`;
          return null;
        },
      };
      return { ok: true, status: 200, headers, text: async () => '' };
    });

    const { record } = await discover('example.com', { wellKnownFallback: true });
    expect(record.pka).toBeDefined();
  });

  it('accepts quoted keyid in Signature-Input', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const pka = 'z' + b58encode(rawPub);
    const nowSec = Math.floor(Date.now() / 1000);
    const kid = 'g1';
    const order = ['AID-Challenge', '@method', '@target-uri', 'host', 'date'];

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
              v: 'aid1',
              u: 'https://api.example.com/mcp',
              p: 'mcp',
              k: pka,
              i: kid,
            }),
        };
      }
      const challenge = init?.headers?.['AID-Challenge'] ?? '';
      const _date = init?.headers?.['Date'] ?? '';
      const method = 'GET';
      const _target = url;
      const _host = new URL(url).host;
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
            lines.push(`"@target-uri": ${_target}`);
            break;
          case 'host':
            lines.push(`"host": ${_host}`);
            break;
          case 'date':
            lines.push(`"date": ${_date}`);
            break;
        }
      }
      const paramsStr = `(${order.map((c) => `"${c}"`).join(' ')});created=${nowSec};keyid="${kid}";alg="ed25519"`;
      lines.push(`"@signature-params": ${paramsStr}`);
      const base = new TextEncoder().encode(lines.join('\n'));
      const sig = new Uint8Array(await nodeWebcrypto.subtle.sign('Ed25519', kp.privateKey, base));
      const headers = {
        get: (name: string) => {
          const k = name.toLowerCase();
          if (k === 'signature-input')
            return `sig=("${order.join('" "')}");created=${nowSec};keyid="${kid}";alg="ed25519"`;
          if (k === 'signature') return `sig=:${toBase64(sig)}:`;
          return null;
        },
      };
      return { ok: true, status: 200, headers, text: async () => '' };
    });

    const { record } = await discover('example.com', { wellKnownFallback: true });
    expect(record.pka).toBeDefined();
  });

  it('rejects when required covered fields are missing', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const pka = 'z' + b58encode(rawPub);
    const nowSec = Math.floor(Date.now() / 1000);
    const kid = 'g1';
    const order = ['AID-Challenge', '@method']; // missing required fields

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
              v: 'aid1',
              u: 'https://api.example.com/mcp',
              p: 'mcp',
              k: pka,
              i: kid,
            }),
        };
      }
      const challenge = init?.headers?.['AID-Challenge'] ?? '';
      const _date = init?.headers?.['Date'] ?? '';
      const method = 'GET';
      const _target = url;
      const _host = new URL(url).host;
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
            lines.push(`"@target-uri": ${_target}`);
            break;
          case 'host':
            lines.push(`"host": ${_host}`);
            break;
          case 'date':
            lines.push(`"date": ${_date}`);
            break;
        }
      }
      const paramsStr = `(${order.map((c) => `"${c}"`).join(' ')});created=${nowSec};keyid=${kid};alg="ed25519"`;
      lines.push(`"@signature-params": ${paramsStr}`);
      const base = new TextEncoder().encode(lines.join('\n'));
      const sig = new Uint8Array(await nodeWebcrypto.subtle.sign('Ed25519', kp.privateKey, base));
      const headers = {
        get: (name: string) => {
          const k = name.toLowerCase();
          if (k === 'signature-input')
            return `sig=("${order.join('" "')}");created=${nowSec};keyid=${kid};alg="ed25519"`;
          if (k === 'signature') return `sig=:${toBase64(sig)}:`;
          return null;
        },
      };
      return { ok: true, status: 200, headers, text: async () => '' };
    });

    await expect(discover('example.com', { wellKnownFallback: true })).rejects.toMatchObject({
      errorCode: 'ERR_SECURITY',
    });
  });

  it('rejects on alg mismatch', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const pka = 'z' + b58encode(rawPub);
    const nowSec = Math.floor(Date.now() / 1000);
    const kid = 'g1';
    const order = ['AID-Challenge', '@method', '@target-uri', 'host', 'date'];

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
              v: 'aid1',
              u: 'https://api.example.com/mcp',
              p: 'mcp',
              k: pka,
              i: kid,
            }),
        };
      }
      const challenge = init?.headers?.['AID-Challenge'] ?? '';
      const _date = init?.headers?.['Date'] ?? '';
      const method = 'GET';
      const _target = url;
      const _host = new URL(url).host;
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
            lines.push(`"@target-uri": ${_target}`);
            break;
          case 'host':
            lines.push(`"host": ${_host}`);
            break;
          case 'date':
            lines.push(`"date": ${_date}`);
            break;
        }
      }
      const paramsStr = `(${order.map((c) => `"${c}"`).join(' ')});created=${nowSec};keyid=${kid};alg="rsa"`;
      lines.push(`"@signature-params": ${paramsStr}`);
      const base = new TextEncoder().encode(lines.join('\n'));
      const sig = new Uint8Array(await nodeWebcrypto.subtle.sign('Ed25519', kp.privateKey, base));
      const headers = {
        get: (name: string) => {
          const k = name.toLowerCase();
          if (k === 'signature-input')
            return `sig=("${order.join('" "')}");created=${nowSec};keyid=${kid};alg="rsa"`;
          if (k === 'signature') return `sig=:${toBase64(sig)}:`;
          return null;
        },
      };
      return { ok: true, status: 200, headers, text: async () => '' };
    });

    await expect(discover('example.com', { wellKnownFallback: true })).rejects.toMatchObject({
      errorCode: 'ERR_SECURITY',
    });
  });

  it('rejects on keyid mismatch', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const pka = 'z' + b58encode(rawPub);
    const nowSec = Math.floor(Date.now() / 1000);
    const recordKid = 'a1';
    const headerKid = 'b2';
    const order = ['AID-Challenge', '@method', '@target-uri', 'host', 'date'];

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
              v: 'aid1',
              u: 'https://api.example.com/mcp',
              p: 'mcp',
              k: pka,
              i: recordKid,
            }),
        };
      }
      const challenge = init?.headers?.['AID-Challenge'] ?? '';
      const _date = init?.headers?.['Date'] ?? '';
      const method = 'GET';
      const _target = url;
      const _host = new URL(url).host;
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
            lines.push(`"@target-uri": ${_target}`);
            break;
          case 'host':
            lines.push(`"host": ${_host}`);
            break;
          case 'date':
            lines.push(`"date": ${_date}`);
            break;
        }
      }
      const paramsStr = `(${order.map((c) => `"${c}"`).join(' ')});created=${nowSec};keyid=${headerKid};alg="ed25519"`;
      lines.push(`"@signature-params": ${paramsStr}`);
      const base = new TextEncoder().encode(lines.join('\n'));
      const sig = new Uint8Array(await nodeWebcrypto.subtle.sign('Ed25519', kp.privateKey, base));
      const headers = {
        get: (name: string) => {
          const k = name.toLowerCase();
          if (k === 'signature-input')
            return `sig=("${order.join('" "')}");created=${nowSec};keyid=${headerKid};alg="ed25519"`;
          if (k === 'signature') return `sig=:${toBase64(sig)}:`;
          return null;
        },
      };
      return { ok: true, status: 200, headers, text: async () => '' };
    });

    await expect(discover('example.com', { wellKnownFallback: true })).rejects.toMatchObject({
      errorCode: 'ERR_SECURITY',
    });
  });

  it('rejects when created is outside 5-minute window', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const pka = 'z' + b58encode(rawPub);
    const skew = 1000 * 1000; // way outside window
    const badCreated = Math.floor(Date.now() / 1000) - skew;
    const kid = 'g1';
    const order = ['AID-Challenge', '@method', '@target-uri', 'host', 'date'];

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
              v: 'aid1',
              u: 'https://api.example.com/mcp',
              p: 'mcp',
              k: pka,
              i: kid,
            }),
        };
      }
      const challenge = init?.headers?.['AID-Challenge'] ?? '';
      const _date = init?.headers?.['Date'] ?? '';
      const method = 'GET';
      const _target = url;
      const _host = new URL(url).host;
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
            lines.push(`"@target-uri": ${_target}`);
            break;
          case 'host':
            lines.push(`"host": ${_host}`);
            break;
          case 'date':
            lines.push(`"date": ${_date}`);
            break;
        }
      }
      const paramsStr = `(${order.map((c) => `"${c}"`).join(' ')});created=${badCreated};keyid=${kid};alg="ed25519"`;
      lines.push(`"@signature-params": ${paramsStr}`);
      const base = new TextEncoder().encode(lines.join('\n'));
      const sig = new Uint8Array(await nodeWebcrypto.subtle.sign('Ed25519', kp.privateKey, base));
      const headers = {
        get: (name: string) => {
          const k = name.toLowerCase();
          if (k === 'signature-input')
            return `sig=("${order.join('" "')}");created=${badCreated};keyid=${kid};alg="ed25519"`;
          if (k === 'signature') return `sig=:${toBase64(sig)}:`;
          return null;
        },
      };
      return { ok: true, status: 200, headers, text: async () => '' };
    });

    await expect(discover('example.com', { wellKnownFallback: true })).rejects.toMatchObject({
      errorCode: 'ERR_SECURITY',
    });
  });

  it('rejects a malformed (non-base64) V1 Signature value with ERR_SECURITY', async () => {
    const kp = await nodeWebcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
    const rawPub = new Uint8Array(await nodeWebcrypto.subtle.exportKey('raw', kp.publicKey));
    const pka = 'z' + b58encode(rawPub);
    const nowSec = Math.floor(Date.now() / 1000);
    const kid = 'g1';
    const order = ['AID-Challenge', '@method', '@target-uri', 'host', 'date'];

    g.fetch = vi.fn(async (url: string) => {
      if (url.includes('/.well-known/agent')) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (n: string) => (n.toLowerCase() === 'content-type' ? 'application/json' : null),
          },
          text: async () =>
            JSON.stringify({
              v: 'aid1',
              u: 'https://api.example.com/mcp',
              p: 'mcp',
              k: pka,
              i: kid,
            }),
        };
      }
      // Valid Signature-Input, but the Signature value carries non-base64 bytes.
      // atob would throw a DOMException; the handshake must surface ERR_SECURITY.
      const headers = {
        get: (name: string) => {
          const k = name.toLowerCase();
          if (k === 'signature-input')
            return `sig=("${order.join('" "')}");created=${nowSec};keyid=${kid};alg="ed25519"`;
          if (k === 'signature') return 'sig=:@@@not-base64@@@:';
          return null;
        },
      };
      return { ok: true, status: 200, headers, text: async () => '' };
    });

    await expect(discover('example.com', { wellKnownFallback: true })).rejects.toMatchObject({
      errorCode: 'ERR_SECURITY',
    });
  });
});
