import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { join, resolve } from 'node:path';
import { readPythonWheelLicense } from './package-claim-archive.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const verifier = readFileSync(join(repoRoot, 'scripts/verify-package-claims.mjs'), 'utf8');
const pythonReadme = readFileSync(join(repoRoot, 'packages/aid-py/README.md'), 'utf8');

function createWheel(entries) {
  const directory = mkdtempSync(join(tmpdir(), 'aid-wheel-license-fixture-'));
  const archive = join(directory, 'fixture.whl');
  const encodedEntries = Buffer.from(JSON.stringify(entries)).toString('base64');
  const script = [
    'import base64, json, sys, zipfile',
    'entries = json.loads(base64.b64decode(sys.argv[2]))',
    'with zipfile.ZipFile(sys.argv[1], "w") as archive:',
    '    for name, contents in entries:',
    '        archive.writestr(name, contents)',
  ].join('\n');
  execFileSync('python3', ['-c', script, archive, encodedEntries], { stdio: 'pipe' });
  return { archive, directory };
}

function withWheel(entries, callback) {
  const fixture = createWheel(entries);
  try {
    callback(fixture.archive);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
}

function hashTree(directory) {
  const hash = createHash('sha256');
  function visit(relativePath) {
    const absolutePath = join(directory, relativePath);
    const entries = readdirSync(absolutePath, { withFileTypes: true }).sort(function (left, right) {
      return left.name.localeCompare(right.name);
    });
    for (const entry of entries) {
      const childRelativePath = join(relativePath, entry.name);
      const childAbsolutePath = join(directory, childRelativePath);
      if (entry.isDirectory()) {
        hash.update(`directory:${childRelativePath}\n`);
        visit(childRelativePath);
      } else {
        const contents = readFileSync(childAbsolutePath);
        hash.update(`file:${childRelativePath}:${statSync(childAbsolutePath).mode}:${contents.length}\n`);
        hash.update(contents);
      }
    }
  }
  visit('.');
  return hash.digest('hex');
}

test('verifier preserves a prior aid build output while it verifies package claims', () => {
  const packageDirectory = join(repoRoot, 'packages/aid');
  const distDirectory = join(packageDirectory, 'dist');
  execFileSync('pnpm', ['-C', packageDirectory, 'build'], { cwd: repoRoot, stdio: 'pipe' });
  const before = hashTree(distDirectory);
  const verification = spawnSync('node', ['scripts/verify-package-claims.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(verification.status, 0, verification.stderr);
  assert.equal(hashTree(distDirectory), before);
});

test('reads the exact wheel license bytes from each supported setuptools layout', () => {
  const expectedLicense = 'MIT fixture license\n';
  for (const licenseEntry of [
    'aid_discovery-2.1.1.dist-info/LICENSE',
    'aid_discovery-2.1.1.dist-info/licenses/LICENSE',
  ]) {
    withWheel([[licenseEntry, expectedLicense]], (archive) => {
      assert.equal(readPythonWheelLicense(archive), expectedLicense);
    });
  }
});

test('rejects a wheel with no supported license entry', () => {
  withWheel([['aid_discovery-2.1.1.dist-info/METADATA', 'Name: aid-discovery\n']], (archive) => {
    assert.throws(() => readPythonWheelLicense(archive), /expected exactly one supported wheel license entry/);
  });
});

test('rejects wheel license entries that are duplicate or ambiguous', () => {
  const layouts = [
    [
      ['aid_discovery-2.1.1.dist-info/LICENSE', 'first\n'],
      ['aid_discovery-2.1.1.dist-info/LICENSE', 'second\n'],
    ],
    [
      ['aid_discovery-2.1.1.dist-info/LICENSE', 'legacy\n'],
      ['aid_discovery-2.1.1.dist-info/licenses/LICENSE', 'pep-639\n'],
    ],
  ];
  for (const entries of layouts) {
    withWheel(entries, (archive) => {
      assert.throws(() => readPythonWheelLicense(archive), /expected exactly one supported wheel license entry/);
    });
  }
});

test('verifier isolates all pip operations and builds npm artifacts outside the checkout', () => {
  assert.match(verifier, /--isolated/);
  assert.match(verifier, /copyNpmPackageSources/);
  assert.match(verifier, /const npmPackages = \['aid', 'aid-engine', 'aid-doctor'\]/);
  assert.match(verifier, /symlinkSync\(join\(repoRoot, 'node_modules'\), join\(temporaryRoot, 'node_modules'\), 'dir'\)/);
  assert.match(verifier, /path !== join\(source, 'dist'\)/);
  assert.match(verifier, /NPM_CONFIG_USERCONFIG/);
  assert.match(verifier, /PIP_CONFIG_FILE/);
  assert.match(verifier, /const \{ env: _ignoredEnvironment, \.\.\.runOptions \} = options;/);
  assert.match(verifier, /\.\.\.runOptions,\s*env: registrySafeEnvironment\(\)/);
  assert.doesNotMatch(verifier, /refusing to overwrite pre-existing/);
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
