import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const verifier = readFileSync(join(repoRoot, 'scripts/verify-package-claims.mjs'), 'utf8');
const pythonReadme = readFileSync(join(repoRoot, 'packages/aid-py/README.md'), 'utf8');

test('verifier isolates all pip operations and builds npm artifacts outside the checkout', () => {
  assert.match(verifier, /--isolated/);
  assert.match(verifier, /copyNpmPackageSources/);
  assert.match(verifier, /NPM_CONFIG_USERCONFIG/);
  assert.match(verifier, /PIP_CONFIG_FILE/);
  assert.match(verifier, /const \{ env: _ignoredEnvironment, \.\.\.runOptions \} = options;/);
  assert.match(verifier, /\.\.\.runOptions,\s*env: registrySafeEnvironment\(\)/);
  assert.match(verifier, /let verifierCheckoutOutputs = \[\];/);
  assert.match(verifier, /verifierCheckoutOutputs = checkoutOutputs;/);
});

test('verifier checks packed README, license, and metadata bytes', () => {
  assert.match(verifier, /readTarEntry/);
  assert.match(verifier, /readPythonArchiveEntry/);
  assert.match(verifier, /assertPackagedReadme/);
  assert.match(verifier, /assertPackagedLicense/);
  assert.match(verifier, /assertPackagedMetadata/);
});

test('Python package documents the real agentcommunity.org production endpoint', () => {
  assert.match(pythonReadme, /https:\/\/agentcommunity\.org\/mcp/);
  assert.doesNotMatch(pythonReadme, /https:\/\/api\.supabase\.com\/mcp/);
});

test('Python package documents the immutable-version release gate', () => {
  assert.match(pythonReadme, /2\.1\.1 is immutable/);
  assert.match(pythonReadme, /next `aid-discovery` patch version/);
  assert.match(pythonReadme, /coordinate PAGE/);
});
