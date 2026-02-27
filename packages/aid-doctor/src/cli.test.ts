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
      expect(output).toContain('✅ Verified (alg=ed25519, kid=g1)');
      expect(output).toContain('✅ No change');
      expect(output).toContain('✅ Record is valid and secure.');
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
  });
});
