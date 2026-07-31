import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'aid-package-claims-'));
const repository = 'https://github.com/agentcommunity/agent-identity-discovery';
const homepage = 'https://aid.agentcommunity.org';
const docs = 'https://aid.agentcommunity.org/docs';
const securityContact = 'security@agentcommunity.org';
const productionDomain = 'agentcommunity.org';

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

function run(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: registrySafeEnvironment(options.env),
    ...options,
  });
}

function registrySafeEnvironment(overrides) {
  const environment = { ...process.env };
  for (const name of ['NPM_TOKEN', 'NODE_AUTH_TOKEN', 'PYPI_TOKEN', 'TWINE_PASSWORD', 'TWINE_USERNAME']) {
    delete environment[name];
  }

  return {
    ...environment,
    NPM_CONFIG_USERCONFIG: join(temporaryRoot, 'npmrc'),
    PIP_CONFIG_FILE: join(temporaryRoot, 'pip.conf'),
    ...overrides,
  };
}

function assertReadme(relativePath, packageName) {
  const contents = read(relativePath);
  expect(contents.includes(repository), `${relativePath} must link to ${repository}`);
  expect(contents.includes(homepage), `${relativePath} must link to ${homepage}`);
  expect(contents.includes(docs), `${relativePath} must link to ${docs}`);
  expect(contents.includes(securityContact), `${relativePath} must include ${securityContact}`);
  expect(contents.includes('SECURITY.md'), `${relativePath} must link to SECURITY.md`);
  expect(contents.includes(packageName), `${relativePath} must use the exact package name ${packageName}`);
  expect(contents.includes(productionDomain), `${relativePath} must include a ${productionDomain} production example`);
}

function assertNpmMetadata(relativePath, packageName) {
  const manifest = readJson(relativePath);
  expect(manifest.name === packageName, `${relativePath} name must be ${packageName}`);
  expect(manifest.version === '2.1.1', `${relativePath} version must be 2.1.1`);
  expect(manifest.repository?.url === repository, `${relativePath} repository must be canonical`);
  expect(manifest.homepage === homepage, `${relativePath} homepage must be canonical`);
  expect(manifest.bugs?.url === `${repository}/issues`, `${relativePath} bugs URL must be canonical`);
  expect(manifest.license === 'MIT', `${relativePath} license must be MIT`);
  expect(manifest.engines?.node === '>=18.17', `${relativePath} node engine must remain >=18.17`);
}

function assertTarEntries(archivePath, expectedEntries) {
  const entries = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8' });
  for (const entry of expectedEntries) {
    expect(entries.split('\n').includes(entry), `${archivePath} must contain ${entry}`);
  }
}

function assertPythonArchiveEntries(archivePath, expectedSuffixes) {
  const script = [
    'import pathlib, sys, tarfile, zipfile',
    'archive = pathlib.Path(sys.argv[1])',
    'names = tarfile.open(archive).getnames() if archive.suffix == ".gz" else zipfile.ZipFile(archive).namelist()',
    'for suffix in sys.argv[2:]:',
    '    if not any(name.endswith(suffix) for name in names):',
    '        raise SystemExit(f"missing {suffix} from {archive}")',
  ].join('\n');
  run('python3', ['-c', script, archivePath, ...expectedSuffixes]);
}

function findArchive(directory, suffix) {
  const match = readdirSync(directory).find((entry) => entry.endsWith(suffix));
  expect(match, `expected a ${suffix} artifact in ${directory}`);
  return join(directory, match);
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

  assertNpmMetadata('packages/aid/package.json', '@agentcommunity/aid');
  assertNpmMetadata('packages/aid-doctor/package.json', '@agentcommunity/aid-doctor');
  assertReadme('packages/aid/README.md', '@agentcommunity/aid');
  assertReadme('packages/aid-doctor/README.md', '@agentcommunity/aid-doctor');
  assertReadme('packages/aid-py/README.md', 'aid-discovery');

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
  run('pnpm', ['-C', 'packages/aid', 'build']);
  run('pnpm', ['-C', 'packages/aid-engine', 'build']);
  run('pnpm', ['-C', 'packages/aid-doctor', 'build']);
  run('pnpm', ['-C', 'packages/aid', 'pack', '--pack-destination', npmOutput]);
  run('pnpm', ['-C', 'packages/aid-doctor', 'pack', '--pack-destination', npmOutput]);

  const aidArchive = findArchive(npmOutput, 'agentcommunity-aid-2.1.1.tgz');
  const doctorArchive = findArchive(npmOutput, 'agentcommunity-aid-doctor-2.1.1.tgz');
  assertTarEntries(aidArchive, ['package/README.md', 'package/LICENSE']);
  assertTarEntries(doctorArchive, ['package/README.md', 'package/LICENSE']);

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
  run(buildPython, ['-m', 'pip', 'install', '--disable-pip-version-check', 'build']);
  run(buildPython, ['-m', 'build', '--sdist', '--wheel', '--outdir', pythonOutput, pythonSource]);
  const sdist = findArchive(pythonOutput, '.tar.gz');
  const wheel = findArchive(pythonOutput, '.whl');
  assertPythonArchiveEntries(sdist, ['LICENSE', 'README.md']);
  assertPythonArchiveEntries(wheel, ['LICENSE', 'README.md']);

  run('python3', ['-m', 'venv', pythonInstallEnvironment]);
  const installPython = join(pythonInstallEnvironment, 'bin', 'python');
  run(installPython, ['-m', 'pip', 'install', '--disable-pip-version-check', wheel]);
  run(installPython, [
    '-c',
    `from aid_py import discover; record, _ = discover('${productionDomain}'); assert record['uri']`,
  ]);
}

try {
  verifySourceClaims();
  verifyArtifacts();
  console.log('Package claims and artifacts verified.');
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
