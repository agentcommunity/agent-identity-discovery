import { promises as fs } from 'node:fs';
import path from 'node:path';

const DOCS_PREFIX = 'https://docs.agentcommunity.org/aid';
const REFERENCE_FILES = [
  'README.md',
  'packages/web/src/components/layout/footer.tsx',
  'packages/web/src/components/layout/header.tsx',
  'packages/web/src/components/landing/hero.tsx',
  'packages/web/src/components/landing/identity.tsx',
  'packages/web/src/components/landing/quick-start.tsx',
  'packages/web/src/components/landing/showcase.tsx',
  'packages/web/src/components/landing/solution.tsx',
  'packages/web/src/components/workbench/v11-fields/security-fields.tsx',
];

const REQUIRED_DOCS = [
  ['index.md'],
  ['specification.md'],
  ['security.md', 'Reference/security.md'],
  ['rationale.md', 'Understand/rationale.md'],
  ['versioning.md', 'Reference/versioning.md'],
  ['Reference/discovery_api.md'],
  ['Reference/identity_pka.md'],
  ['Reference/protocols.md'],
  ['Reference/troubleshooting.md'],
  ['Tooling/aid_doctor.md'],
];

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const readUtf8 = async (filePath) => fs.readFile(filePath, 'utf8');

const readJson = async (filePath) => JSON.parse(await readUtf8(filePath));

const extractVersion = (content, regex, label) => {
  const match = content.match(regex);
  if (!match || !match[1]) {
    throw new Error(`Unable to read ${label}`);
  }
  return match[1];
};

const minorOf = (version) => version.split('.').slice(0, 2).join('.');

const verifyVersionAlignment = async (repoRoot) => {
  const mismatches = [];

  const specPath = path.join(repoRoot, 'packages', 'docs', 'specification.md');
  const constantsPath = path.join(repoRoot, 'protocol', 'constants.yml');
  const rootReadmePath = path.join(repoRoot, 'README.md');
  const aidReadmePath = path.join(repoRoot, 'packages', 'aid', 'README.md');
  const agentsPath = path.join(repoRoot, 'AGENTS.md');

  const [specContent, constantsContent, rootReadme, aidReadme, agentsContent] = await Promise.all([
    readUtf8(specPath),
    readUtf8(constantsPath),
    readUtf8(rootReadmePath),
    readUtf8(aidReadmePath),
    readUtf8(agentsPath),
  ]);

  const specVersion = extractVersion(
    specContent,
    /Agent Identity & Discovery \(AID\)\s+—\s+v(\d+\.\d+\.\d+)/,
    'spec version from packages/docs/specification.md',
  );
  const constantsVersion = extractVersion(
    constantsContent,
    /schemaVersion:\s*['"]?(\d+\.\d+\.\d+)['"]?/,
    'schemaVersion from protocol/constants.yml',
  );

  const aidPackage = await readJson(path.join(repoRoot, 'packages', 'aid', 'package.json'));
  const doctorPackage = await readJson(path.join(repoRoot, 'packages', 'aid-doctor', 'package.json'));
  const conformancePackage = await readJson(
    path.join(repoRoot, 'packages', 'aid-conformance', 'package.json'),
  );

  if (constantsVersion !== specVersion) {
    mismatches.push(
      `Version mismatch: protocol/constants.yml schemaVersion=${constantsVersion} but specification.md=${specVersion}`,
    );
  }

  if (aidPackage.version !== specVersion) {
    mismatches.push(
      `Version mismatch: packages/aid/package.json version=${aidPackage.version} but specification.md=${specVersion}`,
    );
  }

  if (doctorPackage.version !== aidPackage.version) {
    mismatches.push(
      `Version mismatch: packages/aid-doctor/package.json version=${doctorPackage.version} but packages/aid/package.json=${aidPackage.version}`,
    );
  }

  if (conformancePackage.version !== aidPackage.version) {
    mismatches.push(
      `Version mismatch: packages/aid-conformance/package.json version=${conformancePackage.version} but packages/aid/package.json=${aidPackage.version}`,
    );
  }

  const minor = minorOf(specVersion);
  const expectedSpecTag = new RegExp(`^\\s*-\\s*v${minor.replace('.', '\\.')}\\s*$`, 'm');
  if (!expectedSpecTag.test(specContent)) {
    mismatches.push(
      `Spec frontmatter mismatch: expected packages/docs/specification.md tags to include v${minor}`,
    );
  }

  if (!rootReadme.includes(`### v${minor} Highlights`)) {
    mismatches.push(`README.md mismatch: expected heading "### v${minor} Highlights"`);
  }

  if (!rootReadme.includes(`### v${minor} Release Status`)) {
    mismatches.push(`README.md mismatch: expected heading "### v${minor} Release Status"`);
  }

  if (!aidReadme.includes(`## v${minor} Notes`)) {
    mismatches.push(`packages/aid/README.md mismatch: expected heading "## v${minor} Notes"`);
  }

  if (!agentsContent.includes(`### v${minor} notes (Final)`)) {
    mismatches.push(`AGENTS.md mismatch: expected heading "### v${minor} notes (Final)"`);
  }

  const legacyVersionRowPattern = /\|\s*`version`\s*\|\s*`v`\s*\|/m;
  if (legacyVersionRowPattern.test(specContent)) {
    mismatches.push(
      'Specification mismatch: packages/docs/specification.md uses legacy "version" field row; canonical key is "v"',
    );
  }

  const canonicalVRowPattern = /\|\s*`v`\s*\|[^|]*\|\s*\*\*Required\*\*/m;
  if (!canonicalVRowPattern.test(specContent)) {
    mismatches.push(
      'Specification mismatch: packages/docs/specification.md key table must contain required canonical "v" field',
    );
  }

  const docsThatMustTrackMinor = [
    path.join('packages', 'docs', 'Reference', 'discovery_api.md'),
    path.join('packages', 'docs', 'Reference', 'well_known_json.md'),
    path.join('packages', 'docs', 'Reference', 'identity_pka.md'),
    path.join('packages', 'docs', 'quickstart', 'index.md'),
    path.join('packages', 'docs', 'Tooling', 'aid_doctor.md'),
    path.join('packages', 'docs', 'rationale.md'),
  ];
  const [major, minorNumberRaw] = minor.split('.');
  const minorNumber = Number.parseInt(minorNumberRaw, 10);
  if (Number.isFinite(minorNumber) && minorNumber > 0) {
    const staleMinorPattern = new RegExp(`v${major}\\.${minorNumber - 1}(?:\\.\\d+)?`, 'i');
    const docsContent = await Promise.all(
      docsThatMustTrackMinor.map(async (relativePath) => ({
        relativePath,
        content: await readUtf8(path.join(repoRoot, relativePath)),
      })),
    );
    for (const entry of docsContent) {
      if (staleMinorPattern.test(entry.content)) {
        mismatches.push(
          `Docs version mismatch: ${entry.relativePath} still references a prior minor series`,
        );
      }
    }
  }

  return mismatches;
};

const extractDocLinks = (content) => {
  const pattern = /https:\/\/docs\.agentcommunity\.org\/aid(?:\/[^\s)"'`>]*)?/g;
  return [...content.matchAll(pattern)].map((match) => match[0]);
};

const buildCandidates = (url) => {
  const pathname = new URL(url).pathname;
  if (!pathname.startsWith('/aid')) {
    return [];
  }

  const trimmed = pathname.slice('/aid'.length).replace(/\/+$/, '');
  if (!trimmed) {
    return ['index.md'];
  }

  const relativePath = decodeURIComponent(trimmed.replace(/^\/+/, ''));
  return [`${relativePath}.md`, path.join(relativePath, 'index.md')];
};

const findMissingLinks = async (repoRoot) => {
  const docsRoot = path.join(repoRoot, 'packages', 'docs');
  const missing = [];

  for (const relativeFile of REFERENCE_FILES) {
    const absoluteFile = path.join(repoRoot, relativeFile);
    const content = await fs.readFile(absoluteFile, 'utf8');
    const links = extractDocLinks(content);

    for (const link of links) {
      if (!link.startsWith(DOCS_PREFIX)) {
        continue;
      }
      const candidates = buildCandidates(link);
      if (candidates.length === 0) {
        continue;
      }

      let found = false;
      for (const candidate of candidates) {
        const candidatePath = path.join(docsRoot, candidate);
        if (await fileExists(candidatePath)) {
          found = true;
          break;
        }
      }

      if (!found) {
        missing.push({ file: relativeFile, url: link, candidates });
      }
    }
  }

  return missing;
};

const verifyRequiredDocs = async (repoRoot) => {
  const docsRoot = path.join(repoRoot, 'packages', 'docs');
  const missing = [];

  for (const alternatives of REQUIRED_DOCS) {
    let found = false;
    for (const relativeFile of alternatives) {
      const absoluteFile = path.join(docsRoot, relativeFile);
      if (await fileExists(absoluteFile)) {
        found = true;
        break;
      }
    }

    if (!found) {
      missing.push(alternatives.join(' or '));
    }
  }

  return missing;
};

const main = async () => {
  const repoRoot = process.cwd();
  const missingLinks = await findMissingLinks(repoRoot);
  const missingRequiredDocs = await verifyRequiredDocs(repoRoot);
  const versionMismatches = await verifyVersionAlignment(repoRoot);

  if (missingRequiredDocs.length > 0) {
    console.error('Missing required canonical docs files:');
    for (const missing of missingRequiredDocs) {
      console.error(`- packages/docs/${missing}`);
    }
    process.exit(1);
  }

  if (versionMismatches.length > 0) {
    console.error('Version alignment checks failed:');
    for (const mismatch of versionMismatches) {
      console.error(`- ${mismatch}`);
    }
    process.exit(1);
  }

  if (missingLinks.length > 0) {
    console.error('Invalid docs links. External docs must map to files in packages/docs:');
    for (const item of missingLinks) {
      console.error(`- ${item.file}: ${item.url}`);
      console.error(`  expected one of: ${item.candidates.join(' or ')}`);
    }
    process.exit(1);
  }

  console.log('docs:check passed');
  console.log('Canonical docs source: packages/docs');
  console.log('External docs links map to in-repo markdown files.');
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`docs:check failed: ${message}`);
  process.exit(1);
});
