import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatCheckResult } from './output';
import type { DoctorReport } from '@agentcommunity/aid-engine';

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Basic smoke tests for the aid-doctor CLI
describe('AID Doctor CLI', () => {
  describe('Package integrity', () => {
    it('should have a valid package.json', () => {
      const packagePath = path.resolve(__dirname, '../package.json');
      const packageContent = readFileSync(packagePath, 'utf8');
      const packageJson = JSON.parse(packageContent);

      expect(packageJson.name).toBe('@agentcommunity/aid-doctor');
      expect(packageJson.bin).toBeDefined();
      expect(packageJson.bin['aid-doctor']).toBe('./dist/cli.js');
    });

    it('should have CLI entry point file', () => {
      const cliPath = path.resolve(__dirname, './cli.ts');
      const cliContent = readFileSync(cliPath, 'utf8');

      // Check for basic CLI structure
      expect(cliContent).toContain('#!/usr/bin/env node');
      expect(cliContent).toContain('commander');
      expect(cliContent).toContain('program');
    });

    it('should have index export file', () => {
      const indexPath = path.resolve(__dirname, './index.ts');
      const indexContent = readFileSync(indexPath, 'utf8');

      // Check for basic export structure
      expect(indexContent).toContain('export');
    });
  });

  describe('CLI commands', () => {
    it('should have valid CLI structure', () => {
      const cliPath = path.resolve(__dirname, './cli.ts');
      const cliContent = readFileSync(cliPath, 'utf8');

      // Check that the CLI has the expected commander structure
      expect(cliContent).toContain('.name(');
      expect(cliContent).toContain('.description(');
      expect(cliContent).toContain('.version(');
      expect(cliContent).toContain('.command(');
      expect(cliContent).toContain('--security-mode <mode>');
      expect(cliContent).toContain('--dnssec <policy>');
      expect(cliContent).toContain('--pka-policy <policy>');
      expect(cliContent).toContain('base64url JWK x');
      expect(cliContent).not.toContain('z-prefixed multibase Ed25519 public key');
    });
  });

  describe('Output formatting', () => {
    it('should generate a valid success report', () => {
      const report: DoctorReport = {
        domain: 'example.com',
        queried: {
          strategy: 'base-first',
          hint: { source: 'cli', present: false },
          attempts: [{ name: '_agent.example.com', type: 'TXT', result: 'NOERROR', ttl: 300 }],
          wellKnown: {
            attempted: false,
            used: false,
            url: null,
            httpStatus: null,
            contentType: null,
            byteLength: null,
            status: null,
            snippet: null,
          },
        },
        record: {
          raw: 'v=aid1;u=https://a.co;p=mcp',
          parsed: { v: 'aid1', uri: 'https://a.co', proto: 'mcp' },
          valid: true,
          warnings: [],
          errors: [],
        },
        dnssec: { present: true, method: 'RRSIG', proof: {} },
        tls: {
          checked: true,
          valid: true,
          host: 'a.co',
          sni: 'a.co',
          issuer: 'Test',
          san: ['a.co'],
          validFrom: '',
          validTo: '',
          daysRemaining: 90,
          redirectBlocked: false,
        },
        pka: {
          present: true,
          attempted: true,
          verified: true,
          kid: 'g1',
          alg: 'ed25519',
          createdSkewSec: 1,
          covered: [],
        },
        downgrade: { checked: true, previous: null, status: 'first_seen' },
        exitCode: 0,
        cacheEntry: null,
      };
      const output = formatCheckResult(report);
      expect(output).toContain('✅ Found (DNS)');
      expect(output).toContain('✅ Valid');
      expect(output).toContain('✅ Detected');
      expect(output).toContain('✅ Verified (alg=ed25519, legacy kid=g1)');
      expect(output).toContain('✅ First seen');
      expect(output).toContain('✅ Record is valid and secure.');
    });

    it('shows a derived v2 keyid instead of DNS kid', () => {
      const report: DoctorReport = {
        domain: 'example.com',
        queried: {
          strategy: 'base-first',
          hint: { source: 'cli', present: false },
          attempts: [{ name: '_agent.example.com', type: 'TXT', result: 'NOERROR', ttl: 300 }],
          wellKnown: {
            attempted: false,
            used: false,
            url: null,
            httpStatus: null,
            contentType: null,
            byteLength: null,
            status: null,
            snippet: null,
          },
        },
        record: {
          raw: 'v=aid2;u=https://a.co;p=mcp;k=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          parsed: {
            v: 'aid2',
            uri: 'https://a.co',
            proto: 'mcp',
            pka: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          },
          valid: true,
          warnings: [],
          errors: [],
        },
        dnssec: { present: true, method: 'RRSIG', proof: {} },
        tls: {
          checked: true,
          valid: true,
          host: 'a.co',
          sni: 'a.co',
          issuer: 'Test',
          san: ['a.co'],
          validFrom: '',
          validTo: '',
          daysRemaining: 90,
          redirectBlocked: false,
        },
        pka: {
          present: true,
          attempted: true,
          verified: true,
          kid: 'legacy-dns-kid-that-must-not-render',
          alg: 'ed25519',
          createdSkewSec: 1,
          covered: [],
        },
        downgrade: { checked: true, previous: null, status: 'first_seen' },
        exitCode: 0,
        cacheEntry: null,
      };

      const output = formatCheckResult(report);
      expect(output).toContain(
        'Verified (alg=ed25519, keyid=ogRZbCR5KTrPFCAfuYmCMwj0w7Yuk3Lr6YWQWfpkbf0)',
      );
      expect(output).not.toContain('legacy-dns-kid-that-must-not-render');
    });

    it('renders explicit security-state categories', () => {
      const report: DoctorReport = {
        domain: 'example.com',
        queried: {
          strategy: 'base-first',
          hint: { source: 'cli', present: false },
          attempts: [{ name: '_agent.example.com', type: 'TXT', result: 'NOERROR', ttl: 300 }],
          wellKnown: {
            attempted: true,
            used: true,
            url: 'https://example.com/.well-known/agent',
            httpStatus: 200,
            contentType: 'application/json',
            byteLength: 100,
            status: 'ok',
            snippet: null,
          },
        },
        record: {
          raw: 'v=aid2;u=https://a.co;p=mcp',
          parsed: { v: 'aid2', uri: 'https://a.co', proto: 'mcp' },
          valid: true,
          warnings: [],
          errors: [],
        },
        dnssec: { present: false, method: 'RRSIG', proof: null },
        tls: {
          checked: false,
          valid: null,
          host: null,
          sni: null,
          issuer: null,
          san: null,
          validFrom: null,
          validTo: null,
          daysRemaining: null,
          redirectBlocked: null,
        },
        pka: {
          present: false,
          attempted: false,
          verified: null,
          kid: null,
          alg: null,
          createdSkewSec: null,
          covered: null,
        },
        downgrade: {
          checked: true,
          previous: { pka: 'old', kid: null },
          status: 'fallback_well_known_tls',
        },
        exitCode: 0,
        cacheEntry: null,
      };

      const output = formatCheckResult(report);
      expect(output).toContain('TLS-hosted fallback metadata');
      expect(output).toContain('well-known-tls');
    });

    it('should generate actionable suggestions', () => {
      const report: DoctorReport = {
        domain: 'example.com',
        queried: {
          strategy: 'base-first',
          hint: { source: 'cli', present: false },
          attempts: [{ name: '_agent.example.com', type: 'TXT', result: 'NOERROR', ttl: 300 }],
          wellKnown: {
            attempted: false,
            used: false,
            url: null,
            httpStatus: null,
            contentType: null,
            byteLength: null,
            status: null,
            snippet: null,
          },
        },
        record: {
          raw: 'v=aid1;u=https://a.co;p=mcp',
          parsed: { v: 'aid1', uri: 'https://a.co', proto: 'mcp' },
          valid: true,
          warnings: [],
          errors: [],
        },
        dnssec: { present: false, method: 'RRSIG', proof: null },
        tls: {
          checked: true,
          valid: true,
          host: 'a.co',
          sni: 'a.co',
          issuer: 'Test',
          san: ['a.co'],
          validFrom: '',
          validTo: '',
          daysRemaining: 15,
          redirectBlocked: false,
        },
        pka: {
          present: false,
          attempted: false,
          verified: null,
          kid: null,
          alg: null,
          createdSkewSec: null,
          covered: null,
        },
        downgrade: { checked: false, previous: null, status: null },
        exitCode: 0,
        cacheEntry: null,
      };
      const output = formatCheckResult(report);
      expect(output).toContain('💡 Enable DNSSEC');
      expect(output).toContain('💡 Add endpoint proof');
      expect(output).toContain('💡 Renew TLS certificate');
    });

    it('should suggest canonical short keys when long TXT keys are detected', () => {
      const report: DoctorReport = {
        domain: 'example.com',
        queried: {
          strategy: 'base-first',
          hint: { source: 'cli', present: false },
          attempts: [{ name: '_agent.example.com', type: 'TXT', result: 'NOERROR', ttl: 300 }],
          wellKnown: {
            attempted: false,
            used: false,
            url: null,
            httpStatus: null,
            contentType: null,
            byteLength: null,
            status: null,
            snippet: null,
          },
        },
        record: {
          raw: 'version=aid1;uri=https://a.co;proto=mcp',
          parsed: { v: 'aid1', uri: 'https://a.co', proto: 'mcp' },
          valid: true,
          warnings: [
            {
              code: 'LONG_KEY_COMPAT',
              message: 'Long TXT keys are compatibility-only in v1.x.',
            },
          ],
          errors: [],
        },
        dnssec: { present: true, method: 'RRSIG', proof: {} },
        tls: {
          checked: true,
          valid: true,
          host: 'a.co',
          sni: 'a.co',
          issuer: 'Test',
          san: ['a.co'],
          validFrom: '',
          validTo: '',
          daysRemaining: 90,
          redirectBlocked: false,
        },
        pka: {
          present: true,
          attempted: true,
          verified: true,
          kid: 'g1',
          alg: 'ed25519',
          createdSkewSec: 1,
          covered: [],
        },
        downgrade: { checked: true, previous: null, status: 'first_seen' },
        exitCode: 0,
        cacheEntry: null,
      };

      const output = formatCheckResult(report);
      expect(output).toContain('Canonicalize TXT keys');
      expect(output).toContain('Use single-letter aliases');
    });
  });
});
