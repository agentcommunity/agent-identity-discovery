#!/usr/bin/env node

import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

function loadVectors() {
  const __filename = fileURLToPath(import.meta.url);
  const root = path.resolve(path.dirname(__filename), '../../..');
  const raw = fs.readFileSync(path.join(root, 'protocol', 'pka_vectors.json'), 'utf8');
  return JSON.parse(raw).vectors as Array<Record<string, unknown>>;
}

function seedToPkcs8Ed25519(seed: Buffer): Buffer {
  const header = Buffer.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
  ]);
  return Buffer.concat([header, seed]);
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

function publicFromPrivate(priv: crypto.KeyObject): Buffer {
  const spki = crypto.createPublicKey(priv).export({ type: 'spki', format: 'der' }) as Buffer;
  return spki.subarray(spki.length - 32);
}

function quotedParam(source: string, name: string): string {
  const match = new RegExp(`${name}="([^"]+)"`).exec(source);
  if (!match) throw new Error(`Missing ${name} in ${source}`);
  return match[1];
}

function signatureHeaderValue(privateKey: crypto.KeyObject, signatureBase: string): string {
  const sig = crypto.sign(null, Buffer.from(signatureBase), privateKey);
  return `aid-pka=:${Buffer.from(sig).toString('base64')}:`;
}

function cliPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(__filename), '../../aid-doctor/dist/cli.js');
}

async function runDoctorCheck(domain: string): Promise<number> {
  const child = spawn(
    'node',
    [
      cliPath(),
      'check',
      domain,
      '--timeout',
      '800',
      '--show-details',
      '--fallback-timeout',
      '5000',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, AID_ALLOW_INSECURE_WELL_KNOWN: '1' },
    },
  );
  return await new Promise((resolve) => child.on('close', (c) => resolve(c ?? 1)));
}

async function runLegacyPkaCheck() {
  const vector = loadVectors().find((v) => v.id === 'valid-ed25519');
  if (!vector) throw new Error('Missing vector');

  const seed = Buffer.from(vector.key.seed_b64, 'base64');
  const pkcs8 = seedToPkcs8Ed25519(seed);
  const priv = crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const rawPub = publicFromPrivate(priv);
  const pka = 'z' + b58encode(new Uint8Array(rawPub));

  const port = 19081;
  const domain = `127.0.0.1:${port}`;
  const record = { v: 'aid1', u: `http://${domain}/mcp`, p: 'mcp', k: pka, i: 'g1' };

  const server = http.createServer((req, res) => {
    if (!req.url) return res.writeHead(404).end();
    if (req.url === '/.well-known/agent') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(record));
      return;
    }
    if (req.url === '/mcp') {
      const challenge = req.headers['aid-challenge'] as string;
      const date = (req.headers['date'] as string) || new Date().toUTCString();
      const order = ['AID-Challenge', '@method', '@target-uri', 'host', 'date'];
      const lines: string[] = [];
      for (const item of order) {
        switch (item) {
          case 'AID-Challenge':
            lines.push(`"AID-Challenge": ${challenge}`);
            break;
          case '@method':
            lines.push(`"@method": GET`);
            break;
          case '@target-uri':
            lines.push(`"@target-uri": http://${domain}/mcp`);
            break;
          case 'host':
            lines.push(`"host": ${domain}`);
            break;
          case 'date':
            lines.push(`"date": ${date}`);
            break;
        }
      }
      const created = Math.floor(Date.now() / 1000);
      const paramsStr = `(${order.map((c) => `"${c}"`).join(' ')});created=${created};keyid=g1;alg="ed25519"`;
      lines.push(`"@signature-params": ${paramsStr}`);
      const base = Buffer.from(lines.join('\n'));
      const sig = crypto.sign(null, base, priv);
      res.writeHead(200, {
        'Signature-Input': `sig=("${order.join('" "')}");created=${created};keyid=g1;alg="ed25519"`,
        Signature: `sig=:${Buffer.from(sig).toString('base64')}:`,
        Date: date,
      });
      res.end('');
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  console.log(`Legacy aid1 mock server listening on ${domain}`);
  // Give the event loop a brief moment to settle before invoking the CLI
  await new Promise((r) => setTimeout(r, 100));

  const code = await runDoctorCheck(domain);
  server.close();
  if (code !== 0) process.exit(code || 1);
}

async function runAid2PkaCheck() {
  const vector = loadVectors().find((v) => v.id === 'v2-rfc9421-response-signature');
  if (!vector) throw new Error('Missing v2 vector');

  const key = vector.key as { seed_b64: string; public_x: string; jwk_thumbprint: string };
  const seed = Buffer.from(key.seed_b64, 'base64');
  const pkcs8 = seedToPkcs8Ed25519(seed);
  const priv = crypto.createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });

  const port = 19082;
  const domain = `127.0.0.1:${port}`;
  const targetUri = `http://${domain}/mcp?check=1`;
  const record = { v: 'aid2', u: `${targetUri}#ignored`, p: 'mcp', k: key.public_x };

  const server = http.createServer((req, res) => {
    if (!req.url) return res.writeHead(404).end();
    if (req.url === '/.well-known/agent') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(record));
      return;
    }
    if (req.url === '/mcp?check=1') {
      const acceptSignature = req.headers['accept-signature'];
      if (typeof acceptSignature !== 'string') {
        res.writeHead(400).end('missing Accept-Signature');
        return;
      }
      const nonce = quotedParam(acceptSignature, 'nonce');
      const requestedKeyid = quotedParam(acceptSignature, 'keyid');
      if (requestedKeyid !== key.jwk_thumbprint) {
        res.writeHead(400).end('unexpected keyid');
        return;
      }

      const created = Math.floor(Date.now() / 1000);
      const expires = created + 60;
      const status = 401;
      const signatureInput = `aid-pka=("@method";req "@target-uri";req "@authority";req "@status");created=${created};expires=${expires};keyid="${key.jwk_thumbprint}";alg="ed25519";nonce="${nonce}";tag="aid-pka-v2"`;
      const signatureParams = signatureInput.replace(/^aid-pka=/, '');
      const signatureBase = [
        `"@method";req: GET`,
        `"@target-uri";req: ${targetUri}`,
        `"@authority";req: ${domain}`,
        `"@status": ${status}`,
        `"@signature-params": ${signatureParams}`,
      ].join('\n');

      res.writeHead(status, {
        'Signature-Input': signatureInput,
        Signature: signatureHeaderValue(priv, signatureBase),
        'Cache-Control': 'no-store',
      });
      res.end('');
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  console.log(`AID v2 mock server listening on ${domain}`);
  await new Promise((r) => setTimeout(r, 100));

  const code = await runDoctorCheck(domain);
  server.close();
  if (code !== 0) process.exit(code || 1);
}

async function runAid2DomainBoundPkaCheck() {
  const vector = loadVectors().find((v) => v.id === 'v2-db-rfc9421-domain-bound');
  if (!vector) throw new Error('Missing v2 db vector');

  const key = vector.key as { seed_b64: string; public_x: string; jwk_thumbprint: string };
  const seed = Buffer.from(key.seed_b64, 'base64');
  const priv = crypto.createPrivateKey({
    key: seedToPkcs8Ed25519(seed),
    format: 'der',
    type: 'pkcs8',
  });

  const port = 19083;
  const domain = `127.0.0.1:${port}`;
  const targetUri = `http://${domain}/mcp?check=1`;
  const record = { v: 'aid2', u: targetUri, p: 'mcp', k: key.public_x };

  const server = http.createServer((req, res) => {
    if (!req.url) return res.writeHead(404).end();
    if (req.url === '/.well-known/agent') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(record));
      return;
    }
    if (req.url === '/mcp?check=1') {
      const acceptSignature = req.headers['accept-signature'];
      const aidDomain = req.headers['aid-domain'];
      if (typeof acceptSignature !== 'string' || typeof aidDomain !== 'string') {
        res.writeHead(400).end('missing Accept-Signature or AID-Domain');
        return;
      }
      if (aidDomain !== '127.0.0.1') {
        res.writeHead(403, { 'Cache-Control': 'no-store' }).end('domain not served');
        return;
      }
      const nonce = quotedParam(acceptSignature, 'nonce');
      const created = Math.floor(Date.now() / 1000);
      const expires = created + 60;
      const status = 401;
      const signatureInput = `aid-pka=("@method";req "@target-uri";req "@authority";req "aid-domain";req "@status");created=${created};expires=${expires};keyid="${key.jwk_thumbprint}";alg="ed25519";nonce="${nonce}";tag="aid-pka-v2-db"`;
      const signatureParams = signatureInput.replace(/^aid-pka=/, '');
      const signatureBase = [
        `"@method";req: GET`,
        `"@target-uri";req: ${targetUri}`,
        `"@authority";req: ${domain}`,
        `"aid-domain";req: ${aidDomain}`,
        `"@status": ${status}`,
        `"@signature-params": ${signatureParams}`,
      ].join('\n');

      res.writeHead(status, {
        'Signature-Input': signatureInput,
        Signature: signatureHeaderValue(priv, signatureBase),
        'Cache-Control': 'no-store',
      });
      res.end('');
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  console.log(`AID v2 domain-bound mock server listening on ${domain}`);
  await new Promise((r) => setTimeout(r, 100));

  const code = await runDoctorCheck(domain);
  server.close();
  if (code !== 0) process.exit(code || 1);
}

async function main() {
  await runLegacyPkaCheck();
  await runAid2PkaCheck();
  await runAid2DomainBoundPkaCheck();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
