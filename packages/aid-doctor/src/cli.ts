#!/usr/bin/env node

import { Command } from 'commander';
import { readFile, writeFile } from 'fs/promises';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AidError, PROTOCOL_TOKENS, AUTH_TOKENS } from '@agentcommunity/aid';
import {
  runCheck,
  validateTxtRecord,
  buildTxtRecordVariant,
  verifyPka,
  generateEd25519KeyPair,
  type AidGeneratorData,
  type CheckOptions,
} from '@agentcommunity/aid-engine';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import clipboardy from 'clipboardy';
import { formatCheckResult } from './output';
import { loadCache, saveCache } from './cache';

/**
 * CLI-specific function that generates Ed25519 keys and saves them to disk.
 * Uses the pure generateEd25519KeyPair from aid-engine.
 */
async function generateEd25519(
  label?: string,
  outDir?: string,
): Promise<{ publicKey: string; privatePath: string }> {
  // Generate the key pair using the pure function from aid-engine
  const { publicKey, privateKeyPem } = await generateEd25519KeyPair();

  // Handle filesystem operations in the CLI layer
  const dir = outDir || path.join(os.homedir(), '.aid', 'keys');
  await fs.mkdir(dir, { recursive: true });
  const name = (label || 'key') + '-ed25519.key';
  const privatePath = path.join(dir, name);

  // Write the private key to disk
  await fs.writeFile(privatePath, privateKeyPem, { mode: 0o600 });

  return { publicKey, privatePath };
}

const program = new Command();

// Package info
program
  .name('aid-doctor')
  .description('CLI tool for Agent Identity & Discovery (AID)')
  .version('0.1.0');

/**
 * Format an error for human-readable output
 */
function formatError(error: unknown, domain: string): string {
  if (error instanceof AidError) {
    const codeColor = error.code >= 1003 ? chalk.red : chalk.yellow;
    return [
      chalk.red(`❌ AID Discovery Failed for ${domain}`),
      '',
      `  Error Code: ${codeColor(error.code)} (${error.errorCode})`,
      `  Message: ${error.message}`,
    ].join('\n');
  }

  if (error instanceof Error) {
    return [chalk.red(`❌ Unexpected Error for ${domain}`), '', `  ${error.message}`].join('\n');
  }

  return [chalk.red(`❌ Unexpected Error for ${domain}`), '', `  ${String(error)}`].join('\n');
}

// Check command - human-readable report
program
  .command('check <domain>')
  .description('Check a domain for AID records and display a human-readable report')
  .option('-p, --protocol <protocol>', 'Diagnostics hint only; base-first remains canonical')
  .option(
    '--probe-proto-subdomain',
    'If base TXT is missing and --protocol set, probe _agent._<proto>.<domain>',
    false,
  )
  .option(
    '--probe-proto-even-if-base',
    'Probe proto subdomain even when base exists (diagnostics only)',
    false,
  )
  .option('-t, --timeout <ms>', 'DNS query timeout in milliseconds', '5000')
  .option('--no-fallback', 'Disable .well-known fallback on DNS miss', false)
  .option('--fallback-timeout <ms>', 'Timeout for .well-known fetch (ms)', '2000')
  .option('--show-details', 'Show TLS/DNSSEC/PKA short details', false)
  .option('--dump-well-known [path]', 'On fallback failure, print or save body snippet', false)
  .option('--check-downgrade', 'Consult cache and warn when pka has been removed or changed', false)
  .option('--no-color', 'Disable ANSI color output')
  .option('--code', 'Exit with the specific error code on failure (for scripting)')
  .action(
    async (
      domain: string,
      options: {
        protocol?: string;
        probeProtoSubdomain?: boolean;
        probeProtoEvenIfBase?: boolean;
        timeout: string;
        noFallback?: boolean;
        fallbackTimeout?: string;
        showDetails?: boolean;
        dumpWellKnown?: string | boolean;
        checkDowngrade?: boolean;
        noColor?: boolean;
        code?: boolean;
      },
    ) => {
      // Chalk handles --no-color via environment variables or its own detection.
      // commander's --no-color is a standard way to control it.
      if (options.noColor) {
        chalk.level = 0;
      }

      const spinner = ora(`Checking AID record for ${domain}...`).start();

      try {
        const cache = options.checkDowngrade ? await loadCache() : null;
        const previousCacheEntry = cache ? cache[domain] : undefined;

        const report = await runCheck(domain, {
          protocol: options.protocol,
          timeoutMs: Number.parseInt(options.timeout),
          allowFallback: !options.noFallback,
          wellKnownTimeoutMs: Number.parseInt(options.fallbackTimeout || '2000'),
          showDetails: options.showDetails,
          probeProtoSubdomain: options.probeProtoSubdomain,
          probeProtoEvenIfBase: options.probeProtoEvenIfBase,
          dumpWellKnownPath:
            typeof options.dumpWellKnown === 'string' ? options.dumpWellKnown : null,
          checkDowngrade: options.checkDowngrade,
          previousCacheEntry,
        } as CheckOptions);

        if (cache && report.cacheEntry) {
          cache[domain] = report.cacheEntry;
          await saveCache(cache);
        }

        spinner.stop();
        console.log(formatCheckResult(report));

        // Exit with report exit code
        process.exit(report.exitCode);
      } catch (error) {
        spinner.stop();
        console.log(formatError(error, domain));

        // Exit with error code
        if (options.code && error instanceof AidError) {
          process.exit(error.code);
        } else {
          process.exit(1);
        }
      }
    },
  );

// JSON command - machine-readable JSON output
program
  .command('json <domain>')
  .description('Check a domain for AID records and output machine-readable JSON')
  .option('-p, --protocol <protocol>', 'Try protocol-specific subdomain first')
  .option('-t, --timeout <ms>', 'DNS query timeout in milliseconds', '5000')
  .option('--no-fallback', 'Disable .well-known fallback on DNS miss', false)
  .option('--fallback-timeout <ms>', 'Timeout for .well-known fetch (ms)', '2000')
  .option('--show-details', 'Show TLS/DNSSEC/PKA short details', false)
  .option('--dump-well-known [path]', 'On fallback failure, print or save body snippet', false)
  .option('--check-downgrade', 'Consult cache and warn when pka has been removed or changed', false)
  .option('--no-color', 'Disable ANSI color output')
  .option('--code', 'Exit with the specific error code on failure (for scripting)')
  .action(
    async (
      domain: string,
      options: {
        protocol?: string;
        timeout: string;
        noFallback?: boolean;
        fallbackTimeout?: string;
        showDetails?: boolean;
        dumpWellKnown?: string | boolean;
        checkDowngrade?: boolean;
        noColor?: boolean;
        code?: boolean;
      },
    ) => {
      try {
        const cache = options.checkDowngrade ? await loadCache() : null;
        const previousCacheEntry = cache ? cache[domain] : undefined;

        const report = await runCheck(domain, {
          protocol: options.protocol,
          timeoutMs: Number.parseInt(options.timeout),
          allowFallback: !options.noFallback,
          wellKnownTimeoutMs: Number.parseInt(options.fallbackTimeout || '2000'),
          showDetails: options.showDetails || false,
          probeProtoSubdomain: false, // JSON command doesn't support proto probing for now
          probeProtoEvenIfBase: false,
          dumpWellKnownPath:
            typeof options.dumpWellKnown === 'string' ? options.dumpWellKnown : null,
          checkDowngrade: options.checkDowngrade || false,
          previousCacheEntry,
        } as CheckOptions);

        if (cache && report.cacheEntry) {
          cache[domain] = report.cacheEntry;
          await saveCache(cache);
        }

        console.log(JSON.stringify(report, null, 2));
        process.exit(report.exitCode);
      } catch (error) {
        // Output error result
        if (error instanceof AidError) {
          console.log(
            JSON.stringify(
              {
                success: false,
                domain,
                error: {
                  code: error.code,
                  errorCode: error.errorCode,
                  message: error.message,
                },
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          );

          process.exit(options.code ? error.code : 1);
        } else if (error instanceof Error) {
          console.log(
            JSON.stringify(
              {
                success: false,
                domain,
                error: {
                  code: 1,
                  errorCode: 'UNKNOWN_ERROR',
                  message: error.message,
                },
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          );

          process.exit(1);
        } else {
          console.log(
            JSON.stringify(
              {
                success: false,
                domain,
                error: {
                  code: 1,
                  errorCode: 'UNKNOWN_ERROR',
                  message: String(error),
                },
                timestamp: new Date().toISOString(),
              },
              null,
              2,
            ),
          );

          process.exit(1);
        }
      }
    },
  );

// PKA helpers
program
  .command('pka')
  .description('PKA key helpers')
  .addCommand(
    new Command('generate')
      .description(
        'Generate a new Ed25519 keypair and print the public key (z...); private key saved to ~/.aid/keys',
      )
      .option('--label <name>', 'Key label (filename prefix)')
      .option('--out <dir>', 'Output directory for private key')
      .option('--print-private', 'Also print private key PEM to stdout (not recommended)', false)
      .action(async (opts: { label?: string; out?: string; printPrivate?: boolean }) => {
        const { publicKey, privatePath } = await generateEd25519(opts.label, opts.out);
        console.log(publicKey);
        console.error(`Saved private key to ${privatePath}`);
        if (opts.printPrivate) {
          console.error('Printing private key was requested; handle with care.');
        }
      }),
  )
  .addCommand(
    new Command('verify')
      .description('Verify a PKA public key string')
      .requiredOption('--key <pka>', 'z-prefixed multibase Ed25519 public key')
      .action((opts: { key: string }) => {
        const res = verifyPka(opts.key);
        if (res.valid) console.log('✅ valid');
        else {
          console.log('❌ invalid' + (res.reason ? `: ${res.reason}` : ''));
          process.exitCode = 1;
        }
      }),
  );

// Generator command
program
  .command('generate')
  .description('Run an interactive prompt to generate a new AID record')
  .option('--save-draft <path>', 'Save the generated record to a file')
  .action(async (opts: { saveDraft?: string }) => {
    console.log(chalk.bold.cyan('AID Record Generator'));
    console.log(chalk.gray('This tool will guide you through creating a valid DNS TXT record.\n'));

    const answers = await inquirer.prompt<Partial<AidGeneratorData>>([
      {
        type: 'input',
        name: 'domain',
        message: 'What is the primary domain for your agent?',
        validate: (input: string) => (input ? true : 'Domain cannot be empty.'),
      },
      {
        type: 'input',
        name: 'uri',
        message: "What is the full URI of your agent's endpoint?",
        validate: (input: string) => {
          try {
            new URL(input);
            return true;
          } catch {
            return 'Please enter a valid URI (e.g., https://api.example.com/agent).';
          }
        },
      },
      {
        type: 'list',
        name: 'proto',
        message: 'Select the communication protocol:',
        choices: Object.keys(PROTOCOL_TOKENS),
        default: 'mcp',
      },
      {
        type: 'list',
        name: 'auth',
        message: 'Select the authentication method (if any):',
        choices: ['none', ...Object.keys(AUTH_TOKENS)],
        filter: (val: string) => (val === 'none' ? '' : val),
      },
      {
        type: 'input',
        name: 'desc',
        message: 'Enter a short description (optional):',
        validate: (input: string) => {
          if (!input) return true; // Optional field
          const byteLength = new TextEncoder().encode(input).length;
          return byteLength <= 60 || `Description is ${byteLength} bytes (max 60).`;
        },
      },
      {
        type: 'input',
        name: 'docs',
        message: 'Docs URL (https, optional):',
        validate: (input: string) => {
          if (!input) return true;
          try {
            const u = new URL(input);
            return u.protocol === 'https:' || 'Docs must be https:// URL';
          } catch {
            return 'Docs must be https:// URL';
          }
        },
      },
      {
        type: 'input',
        name: 'dep',
        message: 'Deprecation date (ISO 8601 UTC, e.g., 2026-01-01T00:00:00Z, optional):',
        validate: (input: string) => {
          if (!input) return true;
          return (
            (/Z$/.test(input) && !Number.isNaN(Date.parse(input))) || 'Must be ISO 8601 UTC with Z'
          );
        },
      },
      {
        type: 'confirm',
        name: 'addPka',
        message: 'Add PKA endpoint proof now?',
        default: false,
      },
      {
        type: 'input',
        name: 'pka',
        message: 'PKA public key (z-prefixed multibase Ed25519):',
        when: (a: { addPka?: boolean }) => Boolean(a.addPka),
        validate: (input: string) => {
          if (!input) return 'PKA key required when adding PKA';
          const r = verifyPka(input);
          return r.valid || r.reason || 'Invalid';
        },
      },
      {
        type: 'input',
        name: 'kid',
        message: 'kid (1-6 chars [a-z0-9]):',
        when: (a: { addPka?: boolean }) => Boolean(a.addPka),
        validate: (input: string) =>
          /^(?:[a-z0-9]{1,6})$/.test(input) || 'kid must match [a-z0-9]{1,6}',
      },
    ]);

    // We cast here because inquirer provides a partial object based on answers
    const formData = answers as AidGeneratorData;
    // Canonical TXT output is short-key only (v,u,p,...) for byte efficiency.
    // Parser compatibility for long keys is handled in SDK parsers.
    const txtRecord = buildTxtRecordVariant(formData, true);
    const validation = validateTxtRecord(txtRecord);

    console.log(chalk.green('\n--- Generation Complete ---\n'));
    console.log(chalk.bold('Host:'));
    console.log(chalk.yellow(`_agent.${formData.domain}`));
    console.log('');
    console.log(chalk.bold('Type:'));
    console.log(chalk.yellow('TXT'));
    console.log('');
    console.log(chalk.bold('Value:'));
    console.log(chalk.yellow(txtRecord));
    console.log('');

    if (validation.isValid) {
      try {
        await clipboardy.write(txtRecord);
        console.log(
          chalk.bold.green('✅ Success! The TXT record value has been copied to your clipboard.'),
        );
      } catch {
        // The error object is not needed, so we use an optional catch binding.
        console.log(chalk.red('Could not copy to clipboard. Please copy the value manually.'));
      }

      // Save draft if requested
      if (opts.saveDraft) {
        try {
          await writeFile(opts.saveDraft, txtRecord, 'utf8');
          console.log(chalk.green(`💾 Draft saved to ${opts.saveDraft}`));
        } catch (error) {
          if (error instanceof Error) {
            console.log(chalk.red(`Could not save draft: ${error.message}`));
          } else {
            console.log(chalk.red(`Could not save draft: ${String(error)}`));
          }
        }
      }
    } else {
      console.log(chalk.bold.red(`🔥 Validation Failed: ${validation.error}`));
    }
  });

// Version command with additional info
program
  .command('version')
  .description('Show version information')
  .action(async () => {
    let version = '0.0.0';
    try {
      const pkgUrl = new URL('../package.json', import.meta.url);
      const fileContents = await readFile(pkgUrl, 'utf8');
      const pkg = JSON.parse(fileContents) as { version?: string };
      version = pkg.version ?? version;
    } catch (error) {
      if (error instanceof Error) {
        // ignore - fallback stays 0.0.0
      }
    }
    console.log(
      [
        chalk.bold('aid-doctor') + ' - Agent Identity & Discovery CLI',
        `Version: ${chalk.green(version)}`,
        `Node: ${chalk.gray(process.version)}`,
        `Platform: ${chalk.gray(process.platform)}`,
        '',
        'For more information, visit:',
        chalk.blue('https://aid.agentcommunity.org'),
      ].join('\n'),
    );
  });

// Parse command line arguments
program.parse();
