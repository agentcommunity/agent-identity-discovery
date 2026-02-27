#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * List of showcase domains to validate. Keep this list small and only include
 * live showcase names that currently publish exactly one valid AID record and
 * do not require additional PKA network dependencies.
 *
 * The suite intentionally avoids domains that publish multiple valid TXT answers
 * for compatibility/demo purposes because Issue #95 makes that an ambiguity error.
 */
const DOMAINS: readonly string[] = [
  'ucp.agentcommunity.org',
  'graphql.agentcommunity.org',
] as const;

const TIMEOUT_MS = 15_000;

let failures = 0;

for (const domain of DOMAINS) {
  console.log(`\n🚀 Testing AID discovery for ${domain}...`);

  const __filename = fileURLToPath(import.meta.url);
  const __dirnameResolved = path.dirname(__filename);
  const cliPath = path.resolve(__dirnameResolved, '../../aid-doctor/dist/cli.js');

  const result = spawnSync(
    'node',
    [
      '--no-warnings',
      '--experimental-modules',
      cliPath,
      'check',
      domain,
      '--timeout',
      String(TIMEOUT_MS),
    ],
    {
      stdio: 'inherit',
      shell: false,
      env: { ...process.env, AID_SKIP_SECURITY: '1' },
    },
  );

  if (result.error) {
    console.error(`❌ Failed to spawn aid-doctor for ${domain}:`, result.error);
    failures++;
    continue;
  }

  if (result.status === 0) {
    console.log(`✅ Success for ${domain}`);
  } else {
    console.error(`❌ aid-doctor exited with code ${result.status} for ${domain}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n❌ E2E tests failed for ${failures} domain(s).`);
  process.exit(1);
}

console.log('\n🎉 All E2E tests passed!');
