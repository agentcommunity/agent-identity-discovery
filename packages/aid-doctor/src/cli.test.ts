import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { formatCheckResult } from './output';
import type { DoctorReport } from '@agentcommunity/aid-engine';

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const makeReport = (overrides: Partial<DoctorReport> = {}): DoctorReport => ({
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
  ...overrides,
});

const importCliWithMocks = async (runCheck = vi.fn()) => {
  vi.resetModules();

  vi.doMock('@agentcommunity/aid-engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@agentcommunity/aid-engine')>();
    return { ...actual, runCheck };
  });
  vi.doMock('ora', () => ({
    default: () => ({
      start() {
        return this;
      },
      stop() {},
    }),
  }));

  return await import('./cli');
};

// Basic smoke tests for the aid-doctor CLI
describe('AID Doctor CLI', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: string | number | undefined;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null) => {
        process.exitCode = Number(code ?? 0);
        return undefined as never;
      });
  });

  afterEach(() => {
    vi.doUnmock('@agentcommunity/aid-engine');
    vi.doUnmock('ora');
    vi.restoreAllMocks();
    process.exitCode = originalExitCode;
  });

  describe('CLI action paths', () => {
    it('enables well-known fallback by default for the check command', async () => {
      const runCheck = vi.fn().mockResolvedValue(makeReport());
      const { createCliProgram } = await importCliWithMocks(runCheck);
      const program = createCliProgram();

      await program.parseAsync(['check', 'example.com'], { from: 'user' });

      expect(runCheck).toHaveBeenCalledWith(
        'example.com',
        expect.objectContaining({
          allowFallback: true,
        }),
      );
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('passes check command protocol probing and strict v2 security options to runCheck', async () => {
      const runCheck = vi.fn().mockResolvedValue(makeReport());
      const { createCliProgram } = await importCliWithMocks(runCheck);
      const program = createCliProgram();

      await program.parseAsync(
        [
          'check',
          'example.com',
          '--protocol',
          'mcp',
          '--probe-proto-subdomain',
          '--probe-proto-even-if-base',
          '--timeout',
          '750',
          '--no-fallback',
          '--fallback-timeout',
          '1250',
          '--security-mode',
          'strict',
          '--dnssec',
          'require',
          '--pka-policy',
          'require',
          '--downgrade-policy',
          'fail',
          '--well-known-policy',
          'disable',
          '--show-details',
          '--dump-well-known',
          '/tmp/aid-well-known.txt',
        ],
        { from: 'user' },
      );

      expect(runCheck).toHaveBeenCalledWith(
        'example.com',
        expect.objectContaining({
          protocol: 'mcp',
          timeoutMs: 750,
          allowFallback: false,
          wellKnownTimeoutMs: 1250,
          securityMode: 'strict',
          dnssecPolicy: 'require',
          pkaPolicy: 'require',
          downgradePolicy: 'fail',
          wellKnownPolicy: 'disable',
          showDetails: true,
          probeProtoSubdomain: true,
          probeProtoEvenIfBase: true,
          dumpWellKnownPath: '/tmp/aid-well-known.txt',
          checkDowngrade: false,
        }),
      );
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('renders the strict PKA check path with the derived v2 keyid', async () => {
      const runCheck = vi.fn().mockResolvedValue(makeReport());
      const { createCliProgram } = await importCliWithMocks(runCheck);
      const program = createCliProgram();

      await program.parseAsync(
        [
          'check',
          'example.com',
          '--security-mode',
          'strict',
          '--pka-policy',
          'require',
          '--no-color',
        ],
        { from: 'user' },
      );

      const output = consoleLogSpy.mock.calls.map(([line]) => String(line)).join('\n');
      expect(output).toContain(
        'Verified (alg=ed25519, keyid=ogRZbCR5KTrPFCAfuYmCMwj0w7Yuk3Lr6YWQWfpkbf0)',
      );
      expect(output).not.toContain('legacy-dns-kid-that-must-not-render');
      expect(processExitSpy).toHaveBeenCalledWith(0);
    });

    it('uses AidError codes for check command failures when --code is set', async () => {
      const runCheck = vi.fn();
      const { createCliProgram } = await importCliWithMocks(runCheck);
      const { AidError } = await import('@agentcommunity/aid');
      runCheck.mockRejectedValue(new AidError('ERR_SECURITY', 'DNSSEC validation failed'));
      const program = createCliProgram();

      await program.parseAsync(['check', 'missing.example', '--code'], {
        from: 'user',
      });

      expect(runCheck).toHaveBeenCalledWith('missing.example', expect.any(Object));
      expect(consoleLogSpy.mock.calls.map(([line]) => String(line)).join('\n')).toContain(
        'AID Discovery Failed for missing.example',
      );
      expect(processExitSpy).toHaveBeenCalledWith(1003);
    });
  });

  describe('Package integrity', () => {
    it('detects installed bin symlink invocations as direct CLI runs', async () => {
      const { isDirectCliInvocation } = await importCliWithMocks();
      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'aid-doctor-cli-'));

      try {
        const distDir = path.join(tmpDir, 'node_modules/@agentcommunity/aid-doctor/dist');
        const binDir = path.join(tmpDir, 'node_modules/.bin');
        mkdirSync(distDir, { recursive: true });
        mkdirSync(binDir, { recursive: true });

        const realCliPath = path.join(distDir, 'cli.js');
        const binPath = path.join(binDir, 'aid-doctor');
        writeFileSync(realCliPath, '#!/usr/bin/env node\n', 'utf8');
        symlinkSync(realCliPath, binPath);

        expect(isDirectCliInvocation(binPath, realCliPath)).toBe(true);
        expect(isDirectCliInvocation(path.join(binDir, 'other'), realCliPath)).toBe(false);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should have a valid package.json', () => {
      const packagePath = path.resolve(__dirname, '../package.json');
      const packageContent = readFileSync(packagePath, 'utf8');
      const packageJson = JSON.parse(packageContent);

      expect(packageJson.name).toBe('@agentcommunity/aid-doctor');
      expect(packageJson.bin).toBeDefined();
      expect(packageJson.bin['aid-doctor']).toBe('dist/cli.js');
    });

    it('uses package.json as the commander version source', async () => {
      const { createCliProgram } = await importCliWithMocks();
      const packagePath = path.resolve(__dirname, '../package.json');
      const packageContent = readFileSync(packagePath, 'utf8');
      const packageJson = JSON.parse(packageContent);

      expect(createCliProgram().version()).toBe(packageJson.version);
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

    it('should not reference protocol-specific subdomain ordering', () => {
      const cliPath = path.resolve(__dirname, './cli.ts');
      const cliContent = readFileSync(cliPath, 'utf8');

      expect(cliContent).not.toContain('Try protocol-specific subdomain first');
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
