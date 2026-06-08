import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type {
  EnterpriseFixture,
  GoldenFixture,
  GoldenRecordCase,
  PkaVector,
  PkaVectorFixture,
} from './index.js';
import {
  enterpriseFixtures as defaultEnterpriseFixtures,
  fixtures as defaultFixtures,
  pkaVectors as defaultPkaVectors,
} from './index.js';

type AidModule = { parse: (txt: string) => unknown };
type CategoryResult = { passed: number; failed: number; total: number };
type UnknownRecord = Record<string, unknown>;
type RuntimePkaVector = PkaVector & UnknownRecord;

const REQUIRED_V1_COVERED = ['AID-Challenge', '@method', '@target-uri', 'host', 'date'] as const;
const REQUIRED_V2_COVERED = [
  '@method;req',
  '@target-uri;req',
  '@authority;req',
  '@status',
] as const;
const V2_MAX_FRESHNESS_SECONDS = 300;
const STALE_V1_CREATED_BEFORE = 1_700_000_000;
const EXPLICIT_V1_FAILURE_FIELDS = ['overrideAlg', 'overrideKeyId'] as const;

export type RunnerResult = {
  passed: number;
  failed: number;
  total: number;
  categories: {
    records: CategoryResult;
    invalid: CategoryResult;
    recordSets: CategoryResult;
    pkaVectors: CategoryResult;
    enterprisePolicies: CategoryResult;
  };
};

export type RunnerOptions = {
  pkaVectors?: PkaVectorFixture;
  enterpriseFixtures?: EnterpriseFixture;
};

async function parseAid(txt: string) {
  const mod = (await import('@agentcommunity/aid')) as AidModule;
  return mod.parse(txt);
}

function loadFixtureFromPath(filePath: string): GoldenFixture {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  const data = fs.readFileSync(abs, 'utf8');
  const json = JSON.parse(data) as GoldenFixture;
  if (!json || !Array.isArray(json.records)) {
    throw new Error('Invalid fixture: missing records[]');
  }
  return json;
}

function emptyCategory(): CategoryResult {
  return { passed: 0, failed: 0, total: 0 };
}

function addCase(category: CategoryResult, ok: boolean): void {
  category.total += 1;
  if (ok) category.passed += 1;
  else category.failed += 1;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function stringField(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  return isNonEmptyString(value) ? value : undefined;
}

function hasRequiredCoveredFields(covered: unknown, required: readonly string[]): boolean {
  return (
    Array.isArray(covered) &&
    covered.length > 0 &&
    covered.every(isNonEmptyString) &&
    required.every((field) => covered.includes(field))
  );
}

function includesNoStore(value: unknown): boolean {
  return (
    isNonEmptyString(value) &&
    value
      .toLowerCase()
      .split(',')
      .map((part) => part.trim())
      .includes('no-store')
  );
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

function quotedParameter(value: string, parameter: string): string | undefined {
  const pattern = new RegExp(`${parameter}="([^"]+)"`, 'i');
  return pattern.exec(value)?.[1];
}

function signatureParamsFromInput(signatureInput: string): string | undefined {
  const prefix = 'aid-pka=';
  return signatureInput.startsWith(prefix) ? signatureInput.slice(prefix.length) : undefined;
}

function signatureBytesFromHeader(signature: string): Buffer | undefined {
  const match = /^aid-pka=:([A-Za-z0-9+/]+={0,2}):$/.exec(signature);
  return match ? Buffer.from(match[1], 'base64') : undefined;
}

function validateV2SignatureBaseMatchesInput(
  signatureBase: string,
  signatureInput: string,
): string | undefined {
  const signatureParams = signatureParamsFromInput(signatureInput);
  if (!signatureParams) return 'aid2 vector Signature-Input must use exact aid-pka label';

  const expectedSignatureParamsLine = `"@signature-params": ${signatureParams}`;
  const actualSignatureParamsLine = signatureBase.split('\n').at(-1);
  if (actualSignatureParamsLine !== expectedSignatureParamsLine) {
    return 'aid2 vector signature_base @signature-params must match Signature-Input';
  }

  return undefined;
}

function verifyV2PkaSignature(
  publicX: string,
  signatureBase: string,
  signature: string,
): string | undefined {
  const signatureBytes = signatureBytesFromHeader(signature);
  if (!signatureBytes) return 'aid2 vector Signature must contain exact aid-pka base64 bytes';

  try {
    const publicKey = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: publicX },
      format: 'jwk',
    });
    const ok = verifySignature(null, Buffer.from(signatureBase, 'utf8'), publicKey, signatureBytes);
    return ok ? undefined : 'aid2 vector Signature must verify against signature_base';
  } catch {
    return 'aid2 vector key.public_x must import as an Ed25519 JWK public key';
  }
}

async function runRecordCases(
  records: GoldenRecordCase[],
  category: CategoryResult,
): Promise<void> {
  for (const c of records) {
    try {
      const parsed = await parseAid(c.raw);
      const ok = sameJson(parsed, c.expected);
      addCase(category, ok);
      if (!ok) {
        console.error(`✗ ${c.name}: mismatch`);
        console.error('  expected:', c.expected);
        console.error('  got     :', parsed);
      }
    } catch (err) {
      addCase(category, false);
      console.error(`✗ ${c.name}: threw`, err);
    }
  }
}

async function runInvalidCases(fix: GoldenFixture, category: CategoryResult): Promise<void> {
  for (const nc of fix.invalid ?? []) {
    try {
      await parseAid(nc.raw);
      addCase(category, false);
      console.error(`✗ ${nc.name}: expected error but parse succeeded`);
    } catch (err: unknown) {
      const ok =
        !nc.errorCode ||
        (typeof err === 'object' &&
          err !== null &&
          'errorCode' in err &&
          (err as { errorCode?: string }).errorCode === nc.errorCode);
      addCase(category, ok);
      if (!ok) {
        console.error(`✗ ${nc.name}: error code mismatch`, err);
      }
    }
  }
}

async function runRecordSetCases(fix: GoldenFixture, category: CategoryResult): Promise<void> {
  for (const recordSet of fix.recordSets ?? []) {
    const validRecords: unknown[] = [];
    let lastAidError: unknown = null;

    for (const raw of recordSet.records) {
      try {
        validRecords.push(await parseAid(raw));
      } catch (err) {
        lastAidError = err;
      }
    }

    if (validRecords.length > 0) {
      const selectedVersion = validRecords.some((record) => (record as { v?: string }).v === 'aid2')
        ? 'aid2'
        : 'aid1';
      const selectedRecords = validRecords.filter(
        (record) => (record as { v?: string }).v === selectedVersion,
      );
      const selected = selectedRecords.length === 1 ? selectedRecords[0] : null;
      const ok = Boolean(
        recordSet.expectedSelected && selected && sameJson(selected, recordSet.expectedSelected),
      );
      addCase(category, ok);
      if (!ok) {
        console.error(`✗ ${recordSet.name}: record set selection mismatch`);
        console.error('  expected:', recordSet.expectedSelected ?? recordSet.expectedErrorCode);
        console.error('  got     :', selectedRecords);
      }
      continue;
    }

    const gotErrorCode =
      typeof lastAidError === 'object' && lastAidError !== null && 'errorCode' in lastAidError
        ? (lastAidError as { errorCode?: string }).errorCode
        : undefined;
    const ok = Boolean(recordSet.expectedErrorCode && gotErrorCode === recordSet.expectedErrorCode);
    addCase(category, ok);
    if (!ok) {
      console.error(`✗ ${recordSet.name}: record set error mismatch`, lastAidError);
    }
  }
}

function validateV1PkaCommon(vector: RuntimePkaVector, key: UnknownRecord, errors: string[]): void {
  if (!stringField(key, 'public')) errors.push('aid1 vector key.public must be non-empty');
  if (!isFiniteNumber(vector.created)) errors.push('aid1 vector created must be a number');
  if (!isNonEmptyString(vector.httpDate)) errors.push('aid1 vector httpDate must be non-empty');
}

function validateV1PkaPassVector(
  vector: RuntimePkaVector,
  key: UnknownRecord,
  errors: string[],
): void {
  validateV1PkaCommon(vector, key, errors);
  if (!hasRequiredCoveredFields(vector.covered, REQUIRED_V1_COVERED)) {
    errors.push('aid1 pass vector must cover required request fields');
  }
}

function validateV2PkaCommon(
  vector: RuntimePkaVector,
  record: UnknownRecord,
  key: UnknownRecord,
  errors: string[],
): void {
  const publicKey = stringField(key, 'public_x');
  const thumbprint = stringField(key, 'jwk_thumbprint');
  const recordKey = stringField(record, 'k') ?? stringField(record, 'pka');

  if (!publicKey) errors.push('aid2 vector key.public_x must be non-empty');
  if (!thumbprint) errors.push('aid2 vector key.jwk_thumbprint must be non-empty');
  if (!recordKey) errors.push('aid2 vector record must publish pka/k');
  if (publicKey && recordKey && publicKey !== recordKey) {
    errors.push('aid2 vector record key must match key.public_x');
  }
  if (!isFiniteNumber(vector.created)) errors.push('aid2 vector created must be a number');
  if (
    !Array.isArray(vector.covered) ||
    vector.covered.length === 0 ||
    !vector.covered.every(isNonEmptyString)
  ) {
    errors.push('aid2 vector covered must contain non-empty strings');
  }
}

function validateV2PkaPassVector(
  vector: RuntimePkaVector,
  record: UnknownRecord,
  key: UnknownRecord,
  errors: string[],
): void {
  validateV2PkaCommon(vector, record, key, errors);
  errors.push(...validateV2PkaProofMaterial(vector, key));
}

function validateV2PkaProofMaterial(vector: RuntimePkaVector, key: UnknownRecord): string[] {
  const errors: string[] = [];
  if (!hasRequiredCoveredFields(vector.covered, REQUIRED_V2_COVERED)) {
    errors.push('aid2 vector must cover required RFC 9421 components');
  }

  const request = isRecord(vector.request) ? vector.request : undefined;
  const response = isRecord(vector.response) ? vector.response : undefined;
  const thumbprint = stringField(key, 'jwk_thumbprint');
  const publicKey = stringField(key, 'public_x');
  const signatureInput = response ? stringField(response, 'signature_input') : undefined;
  const signature = response ? stringField(response, 'signature') : undefined;
  const acceptSignature = request ? stringField(request, 'accept_signature') : undefined;
  const signatureBase = isNonEmptyString(vector.signature_base) ? vector.signature_base : undefined;

  if (!request) errors.push('aid2 vector request material must be present');
  if (!response) errors.push('aid2 vector response material must be present');
  if (request && !stringField(request, 'method'))
    errors.push('aid2 vector request.method is required');
  if (request && !stringField(request, 'target_uri')) {
    errors.push('aid2 vector request.target_uri is required');
  }
  if (request && !stringField(request, 'authority')) {
    errors.push('aid2 vector request.authority is required');
  }
  if (request && !acceptSignature) {
    errors.push('aid2 vector request.accept_signature is required');
  }
  if (request && !includesNoStore(request.cache_control)) {
    errors.push('aid2 vector request cache_control must include no-store');
  }
  if (response && !isFiniteNumber(response.status)) {
    errors.push('aid2 vector response.status must be numeric');
  }
  if (response && !includesNoStore(response.cache_control)) {
    errors.push('aid2 vector response cache_control must include no-store');
  }
  if (!signatureInput) errors.push('aid2 vector response.signature_input is required');
  if (!signature) errors.push('aid2 vector response.signature is required');
  if (!isFiniteNumber(vector.expires)) errors.push('aid2 vector expires must be a number');
  if (!isNonEmptyString(vector.nonce)) errors.push('aid2 vector nonce must be non-empty');
  if (!signatureBase) {
    errors.push('aid2 vector signature_base must be non-empty');
  }

  if (isFiniteNumber(vector.created) && isFiniteNumber(vector.expires)) {
    const freshnessWindow = vector.expires - vector.created;
    if (freshnessWindow <= 0 || freshnessWindow > V2_MAX_FRESHNESS_SECONDS) {
      errors.push('aid2 vector freshness window must be within 300 seconds');
    }
  }

  if (acceptSignature) {
    for (const token of ['created', 'expires', 'keyid=', 'alg=', 'nonce=', 'tag="aid-pka-v2"']) {
      if (!acceptSignature.includes(token)) {
        errors.push(`aid2 vector Accept-Signature must include ${token}`);
      }
    }
  }

  if (signatureInput) {
    for (const component of REQUIRED_V2_COVERED) {
      if (!signatureInput.includes(`"${component.replace(';req', '')}"`)) {
        errors.push(`aid2 vector Signature-Input must include ${component}`);
      }
    }
    for (const token of ['created=', 'expires=', 'keyid=', 'alg=', 'nonce=', 'tag="aid-pka-v2"']) {
      if (!signatureInput.includes(token)) {
        errors.push(`aid2 vector Signature-Input must include ${token}`);
      }
    }
    const keyid = quotedParameter(signatureInput, 'keyid');
    const nonce = quotedParameter(signatureInput, 'nonce');
    const alg = quotedParameter(signatureInput, 'alg');
    if (thumbprint && keyid !== thumbprint) {
      errors.push('aid2 vector Signature-Input keyid must match key.jwk_thumbprint');
    }
    if (isNonEmptyString(vector.nonce) && nonce !== vector.nonce) {
      errors.push('aid2 vector Signature-Input nonce must match vector nonce');
    }
    if (!alg || alg.toLowerCase() !== 'ed25519') {
      errors.push('aid2 vector Signature-Input alg must be ed25519');
    }
    if (countOccurrences(signatureInput, 'aid-pka=') !== 1) {
      errors.push('aid2 vector Signature-Input must contain exactly one aid-pka member');
    }
    if (countOccurrences(signatureInput, 'nonce=') !== 1) {
      errors.push('aid2 vector Signature-Input must contain exactly one nonce parameter');
    }
  }

  if (signature && countOccurrences(signature, 'aid-pka=') !== 1) {
    errors.push('aid2 vector Signature must contain exactly one aid-pka member');
  }

  if (signatureInput && signatureBase) {
    const signatureBaseError = validateV2SignatureBaseMatchesInput(signatureBase, signatureInput);
    if (signatureBaseError) errors.push(signatureBaseError);
  }

  if (publicKey && signatureBase && signature) {
    const verificationError = verifyV2PkaSignature(publicKey, signatureBase, signature);
    if (verificationError) errors.push(verificationError);
  }

  return errors;
}

function hasExplicitFailureField(vector: RuntimePkaVector, fields: readonly string[]): boolean {
  return fields.some((field) => Object.hasOwn(vector, field) && isNonEmptyString(vector[field]));
}

function hasExpectedFailureEvidence(
  vector: RuntimePkaVector,
  record: UnknownRecord,
  key: UnknownRecord,
): boolean {
  const version = stringField(record, 'v');
  if (version === 'aid1') {
    return (
      hasExplicitFailureField(vector, EXPLICIT_V1_FAILURE_FIELDS) ||
      !hasRequiredCoveredFields(vector.covered, REQUIRED_V1_COVERED) ||
      (isFiniteNumber(vector.created) && vector.created < STALE_V1_CREATED_BEFORE)
    );
  }

  return version === 'aid2' && validateV2PkaProofMaterial(vector, key).length > 0;
}

function validatePkaVector(
  vector: RuntimePkaVector,
  seenIds: Set<string>,
  seenDescriptions: Set<string>,
): string[] {
  const errors: string[] = [];
  const id = isNonEmptyString(vector.id) ? vector.id : undefined;
  const desc = isNonEmptyString(vector.desc) ? vector.desc : undefined;
  const record = isRecord(vector.record) ? vector.record : undefined;
  const key = isRecord(vector.key) ? vector.key : undefined;

  if (!id) {
    errors.push('id must be non-empty');
  } else if (seenIds.has(id)) {
    errors.push('id must be unique');
  } else {
    seenIds.add(id);
  }

  if (!desc) {
    errors.push('desc must be non-empty');
  } else if (seenDescriptions.has(desc)) {
    errors.push('desc must be unique');
  } else {
    seenDescriptions.add(desc);
  }

  if (!record) errors.push('record must be an object');
  if (!key) errors.push('key must be an object');
  if (vector.expect !== 'pass' && vector.expect !== 'fail') {
    errors.push('expect must be pass or fail');
  }

  if (!record || !key || (vector.expect !== 'pass' && vector.expect !== 'fail')) return errors;

  const version = stringField(record, 'v');
  if (version !== 'aid1' && version !== 'aid2') {
    errors.push('record.v must be aid1 or aid2');
    return errors;
  }

  if (version === 'aid1') {
    if (vector.expect === 'pass') validateV1PkaPassVector(vector, key, errors);
    else validateV1PkaCommon(vector, key, errors);
  } else if (vector.expect === 'pass') {
    validateV2PkaPassVector(vector, record, key, errors);
  } else {
    validateV2PkaCommon(vector, record, key, errors);
  }

  if (vector.expect === 'fail' && !hasExpectedFailureEvidence(vector, record, key)) {
    errors.push('fail vector must contain structured expected-failure evidence');
  }

  return errors;
}

function runPkaVectorCases(vectors: PkaVectorFixture | undefined, category: CategoryResult): void {
  const seenIds = new Set<string>();
  const seenDescriptions = new Set<string>();

  for (const vector of vectors?.vectors ?? []) {
    const errors = validatePkaVector(vector as RuntimePkaVector, seenIds, seenDescriptions);
    const ok = errors.length === 0;
    addCase(category, ok);
    if (!ok) {
      console.error(
        `✗ ${vector.id ?? 'unknown-pka-vector'}: invalid PKA vector (${errors.join('; ')})`,
      );
    }
  }
}

function normalizeDnsName(name: string): string {
  return name.toLowerCase().replace(/\.$/, '');
}

function answerContainsPka(answer: UnknownRecord): boolean {
  const data = stringField(answer, 'data');
  return Boolean(data && /(?:^|;)\s*(?:k|pka)=/.test(data));
}

function bodyContainsPka(body: unknown): boolean {
  if (!isRecord(body)) return false;
  return isNonEmptyString(body.k) || isNonEmptyString(body.pka);
}

function hasWarning(expect: UnknownRecord, code: string): boolean {
  return Array.isArray(expect.warningCodes) && expect.warningCodes.includes(code);
}

function validateEnterprisePolicy(policy: unknown, seenNames: Set<string>): string[] {
  const errors: string[] = [];
  if (!isRecord(policy)) return ['policy must be an object'];

  const name = stringField(policy, 'name');
  const runtime = stringField(policy, 'runtime');
  const queryName = stringField(policy, 'queryName');
  const options = isRecord(policy.options) ? policy.options : undefined;
  const dns = isRecord(policy.dns) ? policy.dns : undefined;
  const expect = isRecord(policy.expect) ? policy.expect : undefined;
  const wellKnown = isRecord(policy.wellKnown) ? policy.wellKnown : undefined;

  if (!name) {
    errors.push('name must be non-empty');
  } else if (seenNames.has(name)) {
    errors.push('name must be unique');
  } else {
    seenNames.add(name);
  }
  if (runtime !== 'node' && runtime !== 'browser') errors.push('runtime must be node or browser');
  if (!queryName) errors.push('queryName must be non-empty');
  if (!options) errors.push('options must be an object');
  if (!dns) errors.push('dns must be an object');
  if (!expect) errors.push('expect must be an object');
  if (!dns || !expect) return errors;

  const answers = Array.isArray(dns.answers) ? dns.answers : undefined;
  const hasAnswersProperty = Object.hasOwn(dns, 'answers');
  const dnsErrorCode = stringField(dns, 'errorCode');

  if (hasAnswersProperty && (!answers || answers.length === 0)) {
    errors.push('dns.answers must be a non-empty array when present');
  }
  if (!answers && !dnsErrorCode) {
    errors.push('dns must include answers or errorCode');
  }
  if (answers) {
    for (const answer of answers) {
      if (!isRecord(answer)) {
        errors.push('dns answer must be an object');
        continue;
      }
      const answerName = stringField(answer, 'name');
      if (
        !answerName ||
        !queryName ||
        normalizeDnsName(answerName) !== normalizeDnsName(queryName)
      ) {
        errors.push('dns answer name must match queryName');
      }
      if (!stringField(answer, 'data')) errors.push('dns answer data must be non-empty');
      if (!isFiniteNumber(answer.ttl) || answer.ttl <= 0) {
        errors.push('dns answer ttl must be positive');
      }
    }
  }

  if (!stringField(expect, 'errorCode') && !Array.isArray(expect.warningCodes)) {
    errors.push('expect must include errorCode or warningCodes');
  }
  if (Array.isArray(expect.warningCodes) && !expect.warningCodes.every(isNonEmptyString)) {
    errors.push('expect.warningCodes must contain non-empty strings');
  }
  if (wellKnown && Object.hasOwn(wellKnown, 'body') && !isRecord(wellKnown.body)) {
    errors.push('wellKnown.body must be an object when present');
  }

  const securityMode = options ? stringField(options, 'securityMode') : undefined;
  const downgradePolicy = options ? stringField(options, 'downgradePolicy') : undefined;
  const expectedError = stringField(expect, 'errorCode');
  const hasPkaAnswer =
    answers?.some((answer) => isRecord(answer) && answerContainsPka(answer)) ?? false;
  const hasPkaWellKnown = bodyContainsPka(wellKnown?.body);
  const unsignedDns = answers && dns.ad === false;
  const noPkaDnsAnswer = answers && !hasPkaAnswer;

  if (securityMode === 'strict') {
    if ((unsignedDns || noPkaDnsAnswer) && !expectedError) {
      errors.push('strict mode unsigned or non-PKA DNS answers must expect an error');
    }
    if (noPkaDnsAnswer && Array.isArray(expect.warningCodes) && !expectedError) {
      errors.push('strict mode cannot model missing PKA as warning-only');
    }
    if (!answers && !hasPkaWellKnown && !expectedError) {
      errors.push('strict mode without DNS PKA material must expect an error');
    }
  }

  if (securityMode === 'balanced' && unsignedDns && !hasWarning(expect, 'DNSSEC_PREFERRED')) {
    errors.push('balanced unsigned DNS policy must expect DNSSEC_PREFERRED warning');
  }

  if (downgradePolicy === 'fail' && expectedError !== 'ERR_SECURITY') {
    errors.push('downgradePolicy fail must expect ERR_SECURITY');
  }
  if (downgradePolicy === 'warn' && !hasWarning(expect, 'DOWNGRADE_DETECTED')) {
    errors.push('downgradePolicy warn must expect DOWNGRADE_DETECTED warning');
  }

  return errors;
}

function runEnterpriseCases(
  fixture: EnterpriseFixture | undefined,
  category: CategoryResult,
): void {
  const seenNames = new Set<string>();

  for (const policy of fixture?.securityPolicies ?? []) {
    const errors = validateEnterprisePolicy(policy, seenNames);
    const ok = errors.length === 0;
    addCase(category, ok);
    if (!ok) {
      console.error(
        `✗ ${policy.name ?? 'unknown-enterprise-policy'}: invalid policy (${errors.join('; ')})`,
      );
    }
  }
}

export async function runFixture(
  fix: GoldenFixture,
  options: RunnerOptions = {},
): Promise<RunnerResult> {
  const categories: RunnerResult['categories'] = {
    records: emptyCategory(),
    invalid: emptyCategory(),
    recordSets: emptyCategory(),
    pkaVectors: emptyCategory(),
    enterprisePolicies: emptyCategory(),
  };

  await runRecordCases(fix.records as GoldenRecordCase[], categories.records);
  await runInvalidCases(fix, categories.invalid);
  await runRecordSetCases(fix, categories.recordSets);
  runPkaVectorCases(options.pkaVectors, categories.pkaVectors);
  runEnterpriseCases(options.enterpriseFixtures, categories.enterprisePolicies);

  const values = Object.values(categories);
  const passed = values.reduce((sum, category) => sum + category.passed, 0);
  const failed = values.reduce((sum, category) => sum + category.failed, 0);
  const total = values.reduce((sum, category) => sum + category.total, 0);

  return { passed, failed, total, categories };
}

function printResult(result: RunnerResult): void {
  for (const [name, category] of Object.entries(result.categories)) {
    console.log(
      `AID Conformance ${name}: ${category.passed} passed, ${category.failed} failed, total ${category.total}`,
    );
  }
  console.log(
    `AID Conformance: ${result.passed} passed, ${result.failed} failed, total ${result.total}`,
  );
}

async function main() {
  const arg = process.argv[2];
  const fix = arg ? loadFixtureFromPath(arg) : defaultFixtures;
  const options: RunnerOptions = {};
  if (!arg) {
    options.pkaVectors = defaultPkaVectors;
    options.enterpriseFixtures = defaultEnterpriseFixtures;
  }
  const result = await runFixture(fix, options);
  printResult(result);
  process.exitCode = result.failed === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
