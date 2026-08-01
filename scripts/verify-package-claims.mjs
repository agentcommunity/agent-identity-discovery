import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readPythonWheelLicense } from './package-claim-archive.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'aid-package-claims-'));
const repository = 'https://github.com/agentcommunity/agent-identity-discovery';
const homepage = 'https://aid.agentcommunity.org';
const docs = 'https://aid.agentcommunity.org/docs';
const securityContact = 'security@agentcommunity.org';
const securityPolicy = `${repository}/blob/main/SECURITY.md`;
const productionDomain = 'agentcommunity.org';
const expectedProductionUri = 'https://agentcommunity.org/mcp';
const npmPackages = ['aid', 'aid-engine', 'aid-doctor'];

let cleaned = false;
function fail(message) {
  throw new Error(`Package claim verification failed: ${message}`);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function registrySafeEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith('PIP_')) delete environment[name];
  }
  for (const name of ['NPM_TOKEN', 'NODE_AUTH_TOKEN', 'PYPI_TOKEN', 'TWINE_PASSWORD', 'TWINE_USERNAME']) {
    delete environment[name];
  }

  return {
    ...environment,
    NPM_CONFIG_USERCONFIG: join(temporaryRoot, 'npmrc'),
    PIP_CONFIG_FILE: devNull,
  };
}

function run(command, args, options = {}) {
  const { env: _ignoredEnvironment, ...runOptions } = options;
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...runOptions,
    env: registrySafeEnvironment(),
  });
}

function capture(command, args, options = {}) {
  const { env: _ignoredEnvironment, ...runOptions } = options;
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...runOptions,
    env: registrySafeEnvironment(),
  });
}

function assertReadme(contents, label, packageName) {
  expect(contents.includes(repository), `${label} must link to ${repository}`);
  expect(contents.includes(homepage), `${label} must link to ${homepage}`);
  expect(contents.includes(docs), `${label} must link to ${docs}`);
  expect(contents.includes(securityContact), `${label} must include ${securityContact}`);
  expect(contents.includes(securityPolicy), `${label} must link to ${securityPolicy}`);
  expect(contents.includes(packageName), `${label} must use the exact package name ${packageName}`);
  expect(contents.includes(productionDomain), `${label} must include a ${productionDomain} production example`);
}

function assertPackagedReadme(contents, label, packageName) {
  assertReadme(contents, `${label} README`, packageName);
}

function assertPackagedLicense(contents, label, expectedLicense) {
  expect(contents === expectedLicense, `${label} LICENSE must match its package-local license bytes`);
}

function assertNpmMetadata(manifest, label, packageName) {
  expect(manifest.name === packageName, `${label} name must be ${packageName}`);
  expect(manifest.version === '2.1.1', `${label} version must be 2.1.1`);
  expect(manifest.repository?.url === repository, `${label} repository must be canonical`);
  expect(manifest.homepage === homepage, `${label} homepage must be canonical`);
  expect(manifest.bugs?.url === `${repository}/issues`, `${label} bugs URL must be canonical`);
  expect(manifest.license === 'MIT', `${label} license must be MIT`);
  expect(manifest.engines?.node === '>=18.17', `${label} node engine must remain >=18.17`);
}

function assertPackagedMetadata(metadata, label, packageName) {
  assertNpmMetadata(metadata, `${label} package metadata`, packageName);
}

function assertPythonMetadata(metadata, label) {
  for (const expectedLine of [
    'Name: aid-discovery',
    'Version: 2.1.1',
    `Project-URL: Homepage, ${homepage}`,
    `Project-URL: Repository, ${repository}`,
    `Project-URL: Documentation, ${docs}`,
    'License-File: LICENSE',
  ]) {
    expect(metadata.includes(expectedLine), `${label} must include ${expectedLine}`);
  }
}

function readTarEntry(archivePath, entry) {
  return execFileSync('tar', ['-xOzf', archivePath, entry], { encoding: 'utf8' });
}

function readPythonArchiveEntry(archivePath, suffix) {
  const script = [
    'import pathlib, sys, tarfile, zipfile',
    'archive = pathlib.Path(sys.argv[1])',
    'suffix = sys.argv[2]',
    'if archive.suffix == ".gz":',
    '    with tarfile.open(archive) as container:',
    '        names = container.getnames()',
    '        matches = [name for name in names if name.endswith(suffix)]',
    '        if len(matches) != 1: raise SystemExit(f"expected one {suffix}, found {matches}")',
    '        source = container.extractfile(matches[0])',
    '        if source is None: raise SystemExit(f"could not read {matches[0]}")',
    '        sys.stdout.buffer.write(source.read())',
    'else:',
    '    with zipfile.ZipFile(archive) as container:',
    '        names = container.namelist()',
    '        matches = [name for name in names if name.endswith(suffix)]',
    '        if len(matches) != 1: raise SystemExit(f"expected one {suffix}, found {matches}")',
    '        sys.stdout.buffer.write(container.read(matches[0]))',
  ].join('\n');
  return capture('python3', ['-c', script, archivePath, suffix]);
}

function findArchive(directory, suffix) {
  const match = readdirSync(directory).find((entry) => entry.endsWith(suffix));
  expect(match, `expected a ${suffix} artifact in ${directory}`);
  return join(directory, match);
}

function prepareTemporaryConfig() {
  writeFileSync(join(temporaryRoot, 'npmrc'), '');
}

function copyNpmPackageSources() {
  const temporaryPackages = join(temporaryRoot, 'packages');
  run('mkdir', ['-p', temporaryPackages]);
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsup.config.base.ts', 'turbo.json']) {
    cpSync(join(repoRoot, file), join(temporaryRoot, file));
  }
  symlinkSync(join(repoRoot, 'node_modules'), join(temporaryRoot, 'node_modules'), 'dir');
  for (const packageName of npmPackages) {
    const source = join(repoRoot, 'packages', packageName);
    const destination = join(temporaryPackages, packageName);
    cpSync(source, destination, {
      recursive: true,
      filter(path) {
        return path !== join(source, 'dist');
      },
    });
  }
  return temporaryPackages;
}

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function verifySourceClaims() {
  const rootReadme = read('README.md');
  expect(existsSync(join(repoRoot, 'SECURITY.md')), 'root SECURITY.md must exist');
  expect(read('SECURITY.md').includes(securityContact), 'SECURITY.md must name the security contact');
  expect(rootReadme.includes(repository), 'README.md must link to the canonical repository');
  expect(rootReadme.includes(homepage), 'README.md must link to the canonical product home');
  expect(rootReadme.includes(docs), 'README.md must link to the canonical docs');
  expect(rootReadme.includes(securityContact), 'README.md must include the security contact');
  expect(rootReadme.includes('SECURITY.md'), 'README.md must link to SECURITY.md');
  expect(!rootReadme.includes('not yet community-owned'), 'README.md must not claim aid-discovery is not community-owned');
  expect(rootReadme.includes(productionDomain), 'README.md must include an agentcommunity.org production example');

  assertNpmMetadata(readJson('packages/aid/package.json'), 'packages/aid/package.json', '@agentcommunity/aid');
  assertNpmMetadata(readJson('packages/aid-doctor/package.json'), 'packages/aid-doctor/package.json', '@agentcommunity/aid-doctor');
  assertReadme(read('packages/aid/README.md'), 'packages/aid/README.md', '@agentcommunity/aid');
  assertReadme(read('packages/aid-doctor/README.md'), 'packages/aid-doctor/README.md', '@agentcommunity/aid-doctor');
  const pythonReadme = read('packages/aid-py/README.md');
  assertReadme(pythonReadme, 'packages/aid-py/README.md', 'aid-discovery');
  expect(pythonReadme.includes(expectedProductionUri), 'Python README must document the live agentcommunity.org endpoint');

  const pythonProject = read('packages/aid-py/pyproject.toml');
  expect(pythonProject.includes('name = "aid-discovery"'), 'Python project name must be aid-discovery');
  expect(pythonProject.includes('version = "2.1.1"'), 'Python version must be 2.1.1');
  expect(pythonProject.includes('requires-python = ">=3.8"'), 'Python must keep >=3.8 support');
  expect(pythonProject.includes('license = { file = "LICENSE" }'), 'Python must use the package-local LICENSE metadata');
  expect(pythonProject.includes(`Documentation = "${docs}"`), 'Python documentation URL must be canonical');
  expect(read('packages/aid-py/LICENSE') === read('LICENSE'), 'Python LICENSE must match root LICENSE');

  const webPackage = readJson('packages/web/package.json');
  expect(webPackage.scripts.test === 'pnpm gen:content && vitest run', 'web test must generate its ignored content first');
}

function verifyArtifacts() {
  const npmOutput = join(temporaryRoot, 'npm');
  const pythonOutput = join(temporaryRoot, 'python');
  const pythonSource = join(temporaryRoot, 'python-source');
  const pythonBuildEnvironment = join(temporaryRoot, 'python-build');
  const pythonInstallEnvironment = join(temporaryRoot, 'python-install');
  run('mkdir', ['-p', npmOutput, pythonOutput]);
  const temporaryPackages = copyNpmPackageSources();
  run('pnpm', ['-C', join(temporaryPackages, 'aid'), 'build']);
  run('pnpm', ['-C', join(temporaryPackages, 'aid-engine'), 'build']);
  run('pnpm', ['-C', join(temporaryPackages, 'aid-doctor'), 'build']);
  run('pnpm', ['-C', join(temporaryPackages, 'aid'), 'pack', '--pack-destination', npmOutput]);
  run('pnpm', ['-C', join(temporaryPackages, 'aid-doctor'), 'pack', '--pack-destination', npmOutput]);

  const aidArchive = findArchive(npmOutput, 'agentcommunity-aid-2.1.1.tgz');
  const doctorArchive = findArchive(npmOutput, 'agentcommunity-aid-doctor-2.1.1.tgz');
  const npmArtifacts = [
    [aidArchive, '@agentcommunity/aid', 'packages/aid/LICENSE'],
    [doctorArchive, '@agentcommunity/aid-doctor', 'packages/aid-doctor/LICENSE'],
  ];
  for (const [archive, packageName, licensePath] of npmArtifacts) {
    const label = `${packageName} tarball`;
    assertPackagedReadme(readTarEntry(archive, 'package/README.md'), label, packageName);
    assertPackagedLicense(readTarEntry(archive, 'package/LICENSE'), label, read(licensePath));
    assertPackagedMetadata(JSON.parse(readTarEntry(archive, 'package/package.json')), label, packageName);
  }

  const aidInstall = join(temporaryRoot, 'npm-aid');
  const doctorInstall = join(temporaryRoot, 'npm-doctor');
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', aidInstall, aidArchive]);
  run('node', [
    '--input-type=module',
    '--eval',
    `import { discover } from '@agentcommunity/aid'; const result = await discover('${productionDomain}'); if (!result.record?.uri) throw new Error('AID discovery returned no URI');`,
  ], { cwd: aidInstall });
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', doctorInstall, doctorArchive]);
  run('node', ['node_modules/@agentcommunity/aid-doctor/dist/cli.js', 'check', productionDomain], { cwd: doctorInstall });

  run('python3', ['-m', 'venv', pythonBuildEnvironment]);
  const buildPython = join(pythonBuildEnvironment, 'bin', 'python');
  run('cp', ['-R', 'packages/aid-py', pythonSource]);
  run(buildPython, ['-m', 'pip', '--isolated', 'install', '--disable-pip-version-check', 'build']);
  run(buildPython, ['-m', 'build', '--sdist', '--wheel', '--outdir', pythonOutput, pythonSource]);
  const sdist = findArchive(pythonOutput, '.tar.gz');
  const wheel = findArchive(pythonOutput, '.whl');
  const pythonLicense = read('packages/aid-py/LICENSE');
  assertPackagedReadme(readPythonArchiveEntry(sdist, '/README.md'), 'aid-discovery sdist', 'aid-discovery');
  assertPackagedLicense(readPythonArchiveEntry(sdist, '/LICENSE'), 'aid-discovery sdist', pythonLicense);
  assertPythonMetadata(readPythonArchiveEntry(sdist, 'aid_discovery-2.1.1/PKG-INFO'), 'aid-discovery sdist');

  assertPackagedReadme(readPythonArchiveEntry(wheel, '/README.md'), 'aid-discovery wheel', 'aid-discovery');
  assertPackagedLicense(readPythonWheelLicense(wheel), 'aid-discovery wheel', pythonLicense);
  assertPythonMetadata(readPythonArchiveEntry(wheel, 'dist-info/METADATA'), 'aid-discovery wheel');

  run('python3', ['-m', 'venv', pythonInstallEnvironment]);
  const installPython = join(pythonInstallEnvironment, 'bin', 'python');
  run(installPython, ['-m', 'pip', '--isolated', 'install', '--disable-pip-version-check', wheel]);
  const livePythonUri = capture(installPython, [
    '-c',
    `from aid_py import discover; record, _ = discover('${productionDomain}'); print(record['uri'])`,
  ]).trim();
  expect(livePythonUri === expectedProductionUri, `Python discovery must return ${expectedProductionUri}, received ${livePythonUri}`);
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

try {
  prepareTemporaryConfig();
  verifySourceClaims();
  verifyArtifacts();
  console.log('Package claims and artifacts verified.');
} finally {
  cleanup();
}
