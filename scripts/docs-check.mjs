/* global Buffer, URL, console, process */
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const DOCS_PREFIX = 'https://docs.agentcommunity.org/aid';
const REFERENCE_FILES = [
  'packages/aid/README.md',
  'packages/aid-doctor/README.md',
  'packages/aid-conformance/README.md',
  'packages/aid-engine/README.md',
  'packages/aid-rs/README.md',
  'packages/web/src/lib/docs/markdown.ts',
];

const REQUIRED_DOCS = [
  ['index.md'],
  ['specification.md'],
  ['security.md', 'Reference/security.md'],
  ['rationale.md', 'Understand/rationale.md'],
  ['versioning.md', 'Reference/versioning.md'],
  ['Reference/discovery_api.md'],
  ['Reference/identity_pka.md'],
  ['Reference/pka.md'],
  ['Reference/protocols.md'],
  ['Reference/troubleshooting.md'],
  ['Tooling/aid_doctor.md'],
];

const V2_GUIDANCE_FILES = [
  'tracking/plans/2026-05-07-aid-v2-spec-plan.md',
  'README.md',
  'EXAMPLES.md',
  'packages/aid/README.md',
  'packages/aid-conformance/README.md',
  'packages/aid-doctor/README.md',
  'packages/aid-engine/README.md',
  'packages/aid-go/README.md',
  'packages/aid-py/README.md',
  'packages/aid-dotnet/README.md',
  'packages/aid-java/README.md',
  'packages/aid-rs/README.md',
  'packages/docs/quickstart/quickstart_ts.md',
  'packages/docs/quickstart/quickstart_python.md',
  'packages/docs/quickstart/quickstart_go.md',
  'packages/docs/quickstart/quickstart_dotnet.md',
  'packages/docs/quickstart/quickstart_java.md',
  'packages/docs/quickstart/quickstart_rust.md',
  'packages/docs/quickstart/quickstart_mcp.md',
  'packages/docs/quickstart/quickstart_openapi.md',
  'packages/docs/quickstart/quickstart_a2a.md',
  'packages/docs/quickstart/quickstart_browser.md',
  'packages/docs/Reference/discovery_api.md',
  'packages/docs/Reference/identity_pka.md',
  'packages/docs/Reference/pka.md',
  'packages/docs/Reference/protocols.md',
  'packages/docs/Reference/troubleshooting.md',
  'packages/docs/Reference/versioning.md',
  'packages/docs/Understand/faq.md',
  'packages/docs/Understand/rationale.md',
  'packages/docs/Tooling/aid_engine.md',
  'packages/docs/specification.md',
  'packages/docs/specification_v2_explained.md',
  'packages/web/src/generated/docs-index.json',
];

const STALE_V2_MARKERS = [
  /before SDK implementation begins/i,
  /before SDK implementation starts/i,
  /do not begin SDK implementation/i,
  /do not start SDK implementation/i,
  /spec freeze gates before SDK work/i,
  /pre-SDK gate/i,
  /pending exact Structured Fields validation/i,
  /The v1 Standard is a Long-Term Foundation/i,
  /You can build on it with confidence/i,
  /AID v1\.1 provides\s+(?:\*\*)?protocol-specific subdomains/i,
  /Try protocol-specific subdomain names for the same exact host first/i,
  /try protocol-specific names for that same exact host before base/i,
  /query the protocol-specific subdomain first/i,
  /future\s+`?v=aid2`?/i,
  /Use\s+`?kid`?\s+for explicit key rotation/i,
  /rotate PKA via\s+`?kid`?/i,
  /Draft preview, not the current normative specification/i,
  /does not replace the current\s+\[AID v1\.2 specification\]/i,
  /v1\.2 normative key table/i,
  /v1\.2 spec appendix/i,
];

const LEGACY_CONTEXT = /\b(v1(?:\.\d+)?|aid1|legacy|compatib|migration|migrating)\b/i;
const CONTRAST_CONTEXT =
  /\b(no|not|without|remove[ds]?|drop(?:ped)?|forbid(?:den)?|reject(?:ed|s)?|invalid|replaces?|superseded|contrast|compare[sd]?|comparison|versus|vs\.?|break|previous(?:ly)?)\b/i;
const EXPLICIT_AID1_LABEL_CONTEXT =
  /\b(legacy|compatib|migration|migrating|downgrade|fallback|contrast|compare[sd]?|comparison|versus|vs\.?|previous(?:ly)?|replaces?|superseded|what changes from)\b/i;
const REQUIRED_V2_COVERED = ['@method;req', '@target-uri;req', '@authority;req', '@status'];

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

const walkFiles = async (root, predicate) => {
  const results = [];
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(fullPath, predicate)));
    } else if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }

  return results;
};

const isUnpaddedBase64Url = (value) => /^[A-Za-z0-9_-]+$/.test(value) && !value.includes('=');

const contextForLine = (lines, index, radius = 4) =>
  lines.slice(Math.max(0, index - radius), Math.min(lines.length, index + radius + 1)).join('\n');

const surroundingContextForLine = (lines, index, radius = 10) =>
  [
    ...lines.slice(Math.max(0, index - radius), index),
    ...lines.slice(index + 1, Math.min(lines.length, index + radius + 1)),
  ].join('\n');

const isLegacyOrContrast = (line, heading, context = '') =>
  LEGACY_CONTEXT.test(line) ||
  LEGACY_CONTEXT.test(heading) ||
  LEGACY_CONTEXT.test(context) ||
  CONTRAST_CONTEXT.test(line) ||
  CONTRAST_CONTEXT.test(context);

const isStrictLineAllowedContext = (line, heading, context = '') =>
  LEGACY_CONTEXT.test(line) ||
  LEGACY_CONTEXT.test(heading) ||
  LEGACY_CONTEXT.test(context) ||
  CONTRAST_CONTEXT.test(line) ||
  CONTRAST_CONTEXT.test(heading);

const PROTO_FIRST_ALLOWED_CONTEXT =
  /\b(legacy|back-compat(?:ibility)?|compatib(?:ility|le)?|diagnostic|diagnostics|base[- ]failure|base\s+fail(?:s|ure)?|if\s+base\s+fails|when\s+base\s+fails|after\s+base\s+fails|only\s+after\s+base|fallback\s+probing|probe-only|contrast)\b/i;
const PROTO_FIRST_STALE_PATTERNS = [
  /\bbefore\s+the\s+base\s+record\b/i,
  /\bbefore\s+base\b/i,
  /\bprotocol\s+names?\s+first\b/i,
  /\bprotocol-specific\s+names?\b.*\bthen\b.*\bbase\b/i,
  /\bprotocol-specific\s+subdomain\s+names?\b.*\bthen\b.*\bbase\b/i,
  /\bprotocol-specific\s+subdomain\s+first\b/i,
  /\bprotocol-specific\s+lookup\s+first\b/i,
  /\bprobeProtoSubdomain\b.*\b(first|before\s+base|ahead\s+of\s+base)\b/i,
  /\btry\s+protocol-specific\s+(?:DNS\s+)?(?:subdomain\s+names?|subdomains?|lookups?)\b.*\bfirst\b/i,
  /\btry\s+protocol-specific\s+(?:DNS\s+)?names?\b.*\bthen\b.*\bbase\b/i,
  /\bprotocol-specific\s+(?:DNS\s+)?(?:subdomain\s+names?|subdomains?|lookups?|names?)\b.*\b(?:same\s+exact\s+host\s+)?first\b/i,
  /\bprotocol-specific\s+(?:DNS\s+)?(?:subdomain|lookup)\s+first\b/i,
  /\b(?:query|probe|try|queries|probes|tries)\s+_agent\._[^`\s,)]*\b.*\bfirst\b/i,
  /\btry\s+_agent\._[^`\s,)]*\s+first\b/i,
  /\btries\s+_agent\._[^`\s,)]*\s+first\b/i,
  /\bthen\s+(?:the\s+)?exact-host\s+base\b/i,
  /_agent\._(?:<proto>|[a-z0-9_-]+)[^`\s,)]*.*\bfirst\b.*\bthen\s+(?:the\s+)?(?:canonical\s+)?(?:primary|base)\b/i,
  /\bfall\s+back\s+to\s+primary\b/i,
  /\bthen\s+fall\s+back\s+to\s+base\b/i,
  /\bprotocol-specific\s+(?:DNS\s+)?(?:subdomain\s+names?|subdomains?|lookups?|names?)\b.*\b(?:before|ahead\s+of)\s+(?:the\s+)?(?:primary|base)\b/i,
  /\btry\s+protocol-specific\b.*\bbefore\s+(?:the\s+)?(?:primary|base)\b/i,
  /\btry\s+_agent\._(?:<proto>|[a-z0-9_-]+)[^`\s,)]*\b.*\bbefore\s+(?:the\s+)?(?:primary|base)\b/i,
];

const isStaleProtoFirstWording = (line, heading) =>
  PROTO_FIRST_STALE_PATTERNS.some((pattern) => pattern.test(line)) &&
  !PROTO_FIRST_ALLOWED_CONTEXT.test(line) &&
  !PROTO_FIRST_ALLOWED_CONTEXT.test(heading) &&
  !CONTRAST_CONTEXT.test(line);

const guidanceFilesToScan = async (repoRoot) => {
  const explicitFiles = V2_GUIDANCE_FILES.map((relativeFile) => path.join(repoRoot, relativeFile));
  const packageReadmes = await walkFiles(path.join(repoRoot, 'packages'), (filePath) =>
    filePath.endsWith(`${path.sep}README.md`),
  );
  const docsFiles = await walkFiles(path.join(repoRoot, 'packages', 'docs'), (filePath) =>
    /\.(?:md|json)$/.test(filePath),
  );
  const generatedDocsIndex = path.join(
    repoRoot,
    'packages',
    'web',
    'src',
    'generated',
    'docs-index.json',
  );

  return [
    ...new Set([...explicitFiles, ...packageReadmes, ...docsFiles, generatedDocsIndex]),
  ].sort();
};

const hasExplicitAid1Label = (line, heading, context = '') =>
  /\bv=aid2\b/.test(line) ||
  EXPLICIT_AID1_LABEL_CONTEXT.test(line.replace(/\bv=aid1\b/g, '')) ||
  EXPLICIT_AID1_LABEL_CONTEXT.test(heading) ||
  EXPLICIT_AID1_LABEL_CONTEXT.test(context);

const headingForLine = (lines, index) => {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    if (/^#{1,6}\s+/.test(lines[cursor])) return lines[cursor];
  }
  return '';
};

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
  const v2PreviewPath = path.join(repoRoot, 'packages', 'docs', 'specification_v2_explained.md');
  const constantsPath = path.join(repoRoot, 'protocol', 'constants.yml');
  const rootReadmePath = path.join(repoRoot, 'README.md');
  const aidReadmePath = path.join(repoRoot, 'packages', 'aid', 'README.md');
  const agentsPath = path.join(repoRoot, 'AGENTS.md');

  const [specContent, v2PreviewContent, constantsContent, rootReadme, aidReadme, agentsContent] =
    await Promise.all([
      readUtf8(specPath),
      readUtf8(v2PreviewPath),
      readUtf8(constantsPath),
      readUtf8(rootReadmePath),
      readUtf8(aidReadmePath),
      readUtf8(agentsPath),
    ]);

  const specVersion = extractVersion(
    specContent,
    /Agent Identity & Discovery \(AID\)\s+(?:—|-)\s+v(\d+\.\d+\.\d+)/,
    'spec version from packages/docs/specification.md',
  );
  const constantsVersion = extractVersion(
    constantsContent,
    /schemaVersion:\s*['"]?(\d+\.\d+\.\d+)['"]?/,
    'schemaVersion from protocol/constants.yml',
  );
  const constantsSpecVersion = extractVersion(
    constantsContent,
    /specVersion:\s*['"]?(aid\d+)['"]?/,
    'specVersion from protocol/constants.yml',
  );

  const aidPackage = await readJson(path.join(repoRoot, 'packages', 'aid', 'package.json'));
  const doctorPackage = await readJson(
    path.join(repoRoot, 'packages', 'aid-doctor', 'package.json'),
  );
  const conformancePackage = await readJson(
    path.join(repoRoot, 'packages', 'aid-conformance', 'package.json'),
  );

  const constantsMajor = constantsVersion.split('.')[0];
  const specMajor = specVersion.split('.')[0];
  if (constantsMajor === '2' && constantsSpecVersion !== 'aid2') {
    mismatches.push(
      `Version mismatch: protocol/constants.yml schemaVersion=${constantsVersion} but specVersion=${constantsSpecVersion}`,
    );
  }

  if (constantsMajor === '2' && specMajor !== '2') {
    mismatches.push(
      `Version mismatch: protocol/constants.yml schemaVersion=${constantsVersion} but specification.md=${specVersion}; /docs/specification must be the current v2 normative spec`,
    );
  }

  if (constantsVersion !== specVersion) {
    mismatches.push(
      `Version mismatch: protocol/constants.yml schemaVersion=${constantsVersion} but specification.md=${specVersion}`,
    );
  }

  const sdkReleaseMatchesSpec = minorOf(aidPackage.version) === minorOf(specVersion);

  if (!sdkReleaseMatchesSpec) {
    mismatches.push(
      `Version mismatch: packages/aid/package.json version=${aidPackage.version} but specification.md=${specVersion}; package and spec major.minor must match`,
    );
  }

  if (minorOf(doctorPackage.version) !== minorOf(aidPackage.version)) {
    mismatches.push(
      `Version mismatch: packages/aid-doctor/package.json version=${doctorPackage.version} but packages/aid/package.json=${aidPackage.version}; package major.minor values must match`,
    );
  }

  if (minorOf(conformancePackage.version) !== minorOf(aidPackage.version)) {
    mismatches.push(
      `Version mismatch: packages/aid-conformance/package.json version=${conformancePackage.version} but packages/aid/package.json=${aidPackage.version}; package major.minor values must match`,
    );
  }

  const minor = minorOf(specVersion);
  const expectedSpecTag = new RegExp(`^\\s*-\\s*v${minor.replace('.', '\\.')}\\s*$`, 'm');
  if (!expectedSpecTag.test(specContent)) {
    mismatches.push(
      `Spec frontmatter mismatch: expected packages/docs/specification.md tags to include v${minor}`,
    );
  }

  if (sdkReleaseMatchesSpec) {
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
  }

  return mismatches;
};

const verifyCanonicalV2PkaVector = async (repoRoot) => {
  const failures = [];
  const vectorsPath = path.join(repoRoot, 'protocol', 'pka_vectors.json');
  const payload = await readJson(vectorsPath);
  const vector = payload.vectors?.find((item) => item.id === 'v2-rfc9421-response-signature');

  if (!vector) {
    return ['protocol/pka_vectors.json missing canonical vector v2-rfc9421-response-signature'];
  }

  const record = vector.record ?? {};
  const key = vector.key ?? {};
  const request = vector.request ?? {};
  const response = vector.response ?? {};
  const recordKey = record.k ?? record.pka;

  if (record.v !== 'aid2') failures.push('canonical v2 PKA vector record.v must be aid2');
  if (!recordKey) failures.push('canonical v2 PKA vector must include record k/pka');
  if ('i' in record || 'kid' in record) {
    failures.push('canonical v2 PKA vector record must not include DNS i/kid');
  }
  if (recordKey !== key.public_x) {
    failures.push('canonical v2 PKA vector record k must match key.public_x');
  }
  if (!isUnpaddedBase64Url(key.public_x ?? '')) {
    failures.push('canonical v2 PKA vector key.public_x must be unpadded base64url');
  } else if (Buffer.from(key.public_x, 'base64url').length !== 32) {
    failures.push('canonical v2 PKA vector key.public_x must decode to 32 bytes');
  }
  if (!isUnpaddedBase64Url(key.jwk_thumbprint ?? '')) {
    failures.push('canonical v2 PKA vector key.jwk_thumbprint must be unpadded base64url');
  } else {
    const derived = createHash('sha256')
      .update(`{"crv":"Ed25519","kty":"OKP","x":"${key.public_x}"}`)
      .digest('base64url');
    if (derived !== key.jwk_thumbprint) {
      failures.push('canonical v2 PKA vector key.jwk_thumbprint must match RFC 7638 derivation');
    }
  }
  if (!Number.isInteger(vector.created) || !Number.isInteger(vector.expires)) {
    failures.push('canonical v2 PKA vector must include integer created and expires');
  } else if (vector.expires <= vector.created || vector.expires - vector.created > 300) {
    failures.push('canonical v2 PKA vector expires must be after created and within 300 seconds');
  }
  if (!isUnpaddedBase64Url(vector.nonce ?? '')) {
    failures.push('canonical v2 PKA vector must include unpadded base64url nonce');
  } else if (Buffer.from(vector.nonce, 'base64url').length < 32) {
    failures.push('canonical v2 PKA vector nonce must contain at least 32 bytes of entropy');
  }
  for (const covered of REQUIRED_V2_COVERED) {
    const signatureComponent = `"${covered.replace(';req', '')}"${
      covered.endsWith(';req') ? ';req' : ''
    }`;
    if (!request.accept_signature?.includes(signatureComponent)) {
      failures.push(`canonical v2 PKA vector request.accept_signature must request ${covered}`);
    }
  }
  if (!request.accept_signature?.includes(`nonce="${vector.nonce}"`)) {
    failures.push('canonical v2 PKA vector request.accept_signature must carry nonce');
  }
  if (!request.accept_signature?.includes(`keyid="${key.jwk_thumbprint}"`)) {
    failures.push('canonical v2 PKA vector request.accept_signature must carry derived keyid');
  }
  if (!request.accept_signature?.includes('tag="aid-pka-v2"')) {
    failures.push('canonical v2 PKA vector request.accept_signature must carry aid-pka-v2 tag');
  }
  if (!/created;expires/.test(request.accept_signature ?? '')) {
    failures.push(
      'canonical v2 PKA vector request.accept_signature must request created and expires',
    );
  }
  if (
    request.accept_signature?.includes('AID-Challenge') ||
    request.accept_signature?.includes('date')
  ) {
    failures.push(
      'canonical v2 PKA vector request.accept_signature must not use v1 challenge/date fields',
    );
  }
  if (request.cache_control !== 'no-store') {
    failures.push('canonical v2 PKA vector request.cache_control must be no-store');
  }
  if (response.cache_control !== 'no-store') {
    failures.push('canonical v2 PKA vector response.cache_control must be no-store');
  }
  if (!response.signature_input?.includes(`nonce="${vector.nonce}"`)) {
    failures.push('canonical v2 PKA vector response.signature_input must echo nonce');
  }
  if (!response.signature_input?.includes(`keyid="${key.jwk_thumbprint}"`)) {
    failures.push('canonical v2 PKA vector response.signature_input must carry derived keyid');
  }
  if (
    !/created=\d+/.test(response.signature_input ?? '') ||
    !/expires=\d+/.test(response.signature_input ?? '')
  ) {
    failures.push(
      'canonical v2 PKA vector response.signature_input must include created and expires',
    );
  }
  if (!response.signature_input?.includes('tag="aid-pka-v2"')) {
    failures.push('canonical v2 PKA vector response.signature_input must carry aid-pka-v2 tag');
  }
  if (
    response.signature_input?.includes('AID-Challenge') ||
    response.signature_input?.includes('date')
  ) {
    failures.push(
      'canonical v2 PKA vector response.signature_input must not use v1 challenge/date fields',
    );
  }
  if (!response.signature?.startsWith('aid-pka=:')) {
    failures.push(
      'canonical v2 PKA vector response.signature must include aid-pka signature bytes',
    );
  }
  if (!vector.signature_base?.includes('"@signature-params"')) {
    failures.push('canonical v2 PKA vector must include reproducible signature_base');
  }
  if (
    vector.signature_base?.includes('AID-Challenge') ||
    vector.signature_base?.toLowerCase().includes('"date"')
  ) {
    failures.push('canonical v2 PKA vector signature_base must not use v1 challenge/date fields');
  }
  if (!Array.isArray(vector.covered)) {
    failures.push('canonical v2 PKA vector covered set must be listed');
  } else {
    for (const covered of REQUIRED_V2_COVERED) {
      if (!vector.covered.includes(covered)) {
        failures.push(`canonical v2 PKA vector covered set must include ${covered}`);
      }
    }
  }

  return failures;
};

const verifyV2ConstantsAlignment = async (repoRoot) => {
  const failures = [];
  const constantsPath = path.join(repoRoot, 'protocol', 'constants.yml');
  const constantsContent = await readUtf8(constantsPath);

  if (!/specVersion:\s*['"]?aid2['"]?/.test(constantsContent)) {
    failures.push('protocol/constants.yml must identify aid2 as the generated specVersion');
  }
  if (!/supportedSpecVersions:[\s\S]*^\s+-\s*['"]?aid1['"]?\s*$/m.test(constantsContent)) {
    failures.push('protocol/constants.yml supportedSpecVersions must retain aid1 compatibility');
  }
  if (!/supportedSpecVersions:[\s\S]*^\s+-\s*['"]?aid2['"]?/m.test(constantsContent)) {
    failures.push('protocol/constants.yml supportedSpecVersions must include aid2');
  }
  if (/^\s+-\s*(?:kid|i)\b/m.test(constantsContent) || /^\s*i:\s*kid\b/m.test(constantsContent)) {
    failures.push('protocol/constants.yml aid2 record fields must not include DNS kid/i');
  }
  if (!/pka\s*# Unpadded base64url Ed25519 JWK x \(32 bytes\)/.test(constantsContent)) {
    failures.push('protocol/constants.yml pka field must document unpadded base64url JWK x');
  }

  return failures;
};

const verifyIndependentV2Coverage = async (repoRoot) => {
  const failures = [];
  const tsCoverage = path.join(repoRoot, 'packages', 'aid', 'src', 'pka.v2.test.ts');
  const tsContent = await readUtf8(tsCoverage);
  if (
    !tsContent.includes('v2-rfc9421-response-signature') ||
    !tsContent.includes('Accept-Signature') ||
    !tsContent.includes('AID-Challenge')
  ) {
    failures.push(
      'packages/aid/src/pka.v2.test.ts must cover the canonical v2 vector and request header split',
    );
  }

  const candidates = [
    'packages/aid-go/pka_v2_test.go',
    'packages/aid-py/tests/test_pka_vectors.py',
    'packages/aid-dotnet/tests/PkaTests.cs',
    'packages/aid-java/src/test/java/org/agentcommunity/aid/AidV2Test.java',
    'packages/aid-rs/src/pka.rs',
    'packages/aid-conformance/src/index.test.ts',
  ];

  const matches = [];
  for (const relativeFile of candidates) {
    const absoluteFile = path.join(repoRoot, relativeFile);
    if (!(await fileExists(absoluteFile))) continue;
    const content = await readUtf8(absoluteFile);
    const hasVectorCoverage =
      content.includes('v2-rfc9421-response-signature') ||
      (/aid2/i.test(content) &&
        /(nonce|thumbprint|well-known-tls|coexistence|malformed aid2)/i.test(content));
    if (hasVectorCoverage) matches.push(relativeFile);
  }

  if (matches.length === 0) {
    failures.push(
      'v2 coverage must include TS plus one non-TS SDK or conformance file with PKA/vector/discovery coverage',
    );
  }

  return failures;
};

const verifyV2Guidance = async (repoRoot) => {
  const failures = [];

  for (const absoluteFile of await guidanceFilesToScan(repoRoot)) {
    const relativeFile = path.relative(repoRoot, absoluteFile);
    if (!(await fileExists(absoluteFile))) continue;
    const content = await readUtf8(absoluteFile);
    const runStrictV2LineChecks = V2_GUIDANCE_FILES.includes(relativeFile);

    for (const marker of STALE_V2_MARKERS) {
      if (marker.test(content)) {
        failures.push(`${relativeFile}: stale v2 marker matched ${marker}`);
      }
    }

    const lines = content.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const heading = headingForLine(lines, index);
      const context = contextForLine(lines, index);
      const hasLegacyOrContrastContext = isLegacyOrContrast(line, heading, context);
      const aid1LabelContext = surroundingContextForLine(lines, index);
      if (
        runStrictV2LineChecks &&
        /\bv=aid1\b/.test(line) &&
        !hasExplicitAid1Label(line, heading, aid1LabelContext)
      ) {
        failures.push(
          `${relativeFile}:${index + 1}: v=aid1 examples must be labeled legacy/v1 or contrast`,
        );
      }

      if (
        /_agent\.(?:<proto>|\{proto\}|\$\{proto\}|\[proto\])\./i.test(line) &&
        !hasLegacyOrContrastContext
      ) {
        failures.push(
          `${relativeFile}:${index + 1}: protocol-specific lookup must use _agent._<proto>.<domain> or be labeled legacy/contrast`,
        );
      }

      if (
        /\bprotocol-specific DNS lookup\b/i.test(line) &&
        !/\bexact[- ]host\b/i.test(line) &&
        !/_agent\._<proto>|_agent\._mcp/i.test(line) &&
        !hasLegacyOrContrastContext
      ) {
        failures.push(
          `${relativeFile}:${index + 1}: protocol-specific DNS lookup wording must mention exact-host or _agent._<proto>`,
        );
      }

      if (isStaleProtoFirstWording(line, heading)) {
        failures.push(
          `${relativeFile}:${index + 1}: protocol-specific lookup must be base-first by default; proto-prefixed probing must be explicitly legacy, diagnostic, or base-failure-only`,
        );
      }

      if (!runStrictV2LineChecks || isStrictLineAllowedContext(line, heading, context)) continue;

      if (/\bAID-Challenge\b/.test(line)) {
        failures.push(
          `${relativeFile}:${index + 1}: AID-Challenge must be labeled legacy/v1 or contrast`,
        );
      }

      if (/\bdate\b/i.test(line) && /\b(signed|signature|covered|handshake|pka)\b/i.test(line)) {
        failures.push(
          `${relativeFile}:${index + 1}: signed HTTP Date must be labeled legacy/v1 or contrast`,
        );
      }

      if (
        /\b(?:kid|i)\b/i.test(line) &&
        /\b(required|matches?|included|present|publish(?:ed)?|with\s+`?k|keyid)\b/i.test(line)
      ) {
        if (/"kid"\s*:\s*null\b/.test(line)) continue;
        failures.push(
          `${relativeFile}:${index + 1}: DNS kid/i must be labeled legacy/v1 or contrast`,
        );
      }

      if (/\b(base58btc|multibase|z\.\.\.|k=z[A-Za-z0-9])/i.test(line)) {
        failures.push(
          `${relativeFile}:${index + 1}: base58 z... PKA must be labeled legacy/v1 or contrast`,
        );
      }
    }
  }

  return failures;
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
    if (!(await fileExists(absoluteFile))) {
      throw new Error(
        `REFERENCE_FILES entry not found: ${relativeFile} — update REFERENCE_FILES in scripts/docs-check.mjs`,
      );
    }
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

// Domain-binding-specific base-4 covered components (without the optional aid-domain at index 3).
const BASE_4_COVERED = ['@method;req', '@target-uri;req', '@authority;req', '@status'];
const AID_DOMAIN_COMPONENT = 'aid-domain;req';
const AID_DOMAIN_INDEX = 3; // must sit between @authority;req (2) and @status (4)

/**
 * Verify the structural contract of the two domain-bound PKA vectors:
 *  - v2-db-rfc9421-domain-bound  (expect=pass): base-4 + aid-domain;req at index 3, tag aid-pka-v2
 *  - v2-db-domain-mismatch       (expect=fail): same covered shape but signature mismatch → rejected
 * This enforces the one-tag/coverage contract at the docs-authority layer in addition to SDK tests.
 */
const verifyDomainBoundPkaVectors = async (repoRoot) => {
  const failures = [];
  const vectorsPath = path.join(repoRoot, 'protocol', 'pka_vectors.json');
  const payload = await readJson(vectorsPath);

  // --- helper: validate covered set shape for domain-bound vectors ---
  const checkCoveredShape = (vector, label) => {
    if (!Array.isArray(vector.covered)) {
      failures.push(`${label}: covered set must be an array`);
      return;
    }
    const covered = vector.covered;
    const expectedLength = BASE_4_COVERED.length + 1; // base-4 + aid-domain
    if (covered.length !== expectedLength) {
      failures.push(
        `${label}: covered set must have ${expectedLength} components (base-4 + aid-domain;req), got ${covered.length}`,
      );
    }
    // Base-4 components in positions 0,1,2,4 (aid-domain at 3)
    const expectedCovered = [
      BASE_4_COVERED[0],
      BASE_4_COVERED[1],
      BASE_4_COVERED[2],
      AID_DOMAIN_COMPONENT,
      BASE_4_COVERED[3],
    ];
    for (let i = 0; i < expectedCovered.length; i++) {
      if (covered[i] !== expectedCovered[i]) {
        failures.push(
          `${label}: covered[${i}] must be "${expectedCovered[i]}", got "${covered[i]}"`,
        );
      }
    }
    if (covered[AID_DOMAIN_INDEX] !== AID_DOMAIN_COMPONENT) {
      failures.push(
        `${label}: aid-domain;req must be at index ${AID_DOMAIN_INDEX}, got "${covered[AID_DOMAIN_INDEX]}"`,
      );
    }
  };

  // --- v2-db-rfc9421-domain-bound (pass vector) ---
  const boundVector = payload.vectors?.find((v) => v.id === 'v2-db-rfc9421-domain-bound');
  if (!boundVector) {
    failures.push('protocol/pka_vectors.json missing domain-bound pass vector v2-db-rfc9421-domain-bound');
  } else {
    if (boundVector.expect !== 'pass') {
      failures.push('domain-bound pass vector v2-db-rfc9421-domain-bound must have expect=pass');
    }
    if (!boundVector.domain) {
      failures.push('domain-bound pass vector v2-db-rfc9421-domain-bound must include a domain field');
    }
    checkCoveredShape(boundVector, 'v2-db-rfc9421-domain-bound');
    // Tag must be the single aid-pka-v2 tag (not a separate db-specific tag)
    if (!boundVector.response?.signature_input?.includes('tag="aid-pka-v2"')) {
      failures.push(
        'domain-bound pass vector v2-db-rfc9421-domain-bound response.signature_input must carry aid-pka-v2 tag (single-tag contract)',
      );
    }
    // The AID-Domain value must appear in the signature base
    if (
      boundVector.signature_base &&
      !boundVector.signature_base.includes(`"aid-domain";req:`)
    ) {
      failures.push(
        'domain-bound pass vector v2-db-rfc9421-domain-bound signature_base must include the aid-domain;req line',
      );
    }
  }

  // --- v2-db-domain-mismatch (fail vector) ---
  const mismatchVector = payload.vectors?.find((v) => v.id === 'v2-db-domain-mismatch');
  if (!mismatchVector) {
    failures.push('protocol/pka_vectors.json missing domain-bound fail vector v2-db-domain-mismatch');
  } else {
    if (mismatchVector.expect !== 'fail') {
      failures.push('domain-bound mismatch vector v2-db-domain-mismatch must have expect=fail');
    }
    if (!mismatchVector.domain) {
      failures.push('domain-bound mismatch vector v2-db-domain-mismatch must include a domain field');
    }
    checkCoveredShape(mismatchVector, 'v2-db-domain-mismatch');
    // Tag must still be the single aid-pka-v2 tag
    if (!mismatchVector.response?.signature_input?.includes('tag="aid-pka-v2"')) {
      failures.push(
        'domain-bound mismatch vector v2-db-domain-mismatch response.signature_input must carry aid-pka-v2 tag',
      );
    }
  }

  return failures;
};

const main = async () => {
  const repoRoot = process.cwd();
  const missingLinks = await findMissingLinks(repoRoot);
  const missingRequiredDocs = await verifyRequiredDocs(repoRoot);
  const versionMismatches = await verifyVersionAlignment(repoRoot);
  const canonicalVectorFailures = await verifyCanonicalV2PkaVector(repoRoot);
  const domainBoundVectorFailures = await verifyDomainBoundPkaVectors(repoRoot);
  const v2ConstantsFailures = await verifyV2ConstantsAlignment(repoRoot);
  const independentCoverageFailures = await verifyIndependentV2Coverage(repoRoot);
  const v2GuidanceFailures = await verifyV2Guidance(repoRoot);

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

  if (canonicalVectorFailures.length > 0) {
    console.error('Canonical v2 PKA vector checks failed:');
    for (const failure of canonicalVectorFailures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  if (domainBoundVectorFailures.length > 0) {
    console.error('Domain-bound PKA vector structural checks failed:');
    for (const failure of domainBoundVectorFailures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  if (v2ConstantsFailures.length > 0) {
    console.error('v2 constants alignment checks failed:');
    for (const failure of v2ConstantsFailures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  if (independentCoverageFailures.length > 0) {
    console.error('Independent v2 implementation coverage checks failed:');
    for (const failure of independentCoverageFailures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  if (v2GuidanceFailures.length > 0) {
    console.error('v2 docs/readme guidance checks failed:');
    for (const failure of v2GuidanceFailures) {
      console.error(`- ${failure}`);
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
  console.log('AID v2 invariants are covered by docs, fixtures, and implementation tests.');
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`docs:check failed: ${message}`);
  process.exit(1);
});
