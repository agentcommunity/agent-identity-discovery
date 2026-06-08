// Local shape of an AID record for conformance purposes
export type AidRecordV1 = {
  v: 'aid1';
  uri: string;
  proto: string;
  auth?: string;
  desc?: string;
  docs?: string;
  dep?: string;
  pka?: string;
  kid?: string;
};

export type AidRecordV2 = {
  v: 'aid2';
  uri: string;
  proto: string;
  auth?: string;
  desc?: string;
  docs?: string;
  dep?: string;
  pka?: string;
};

export type AidRecord = AidRecordV1 | AidRecordV2;

// Re-export the shared golden fixtures without duplicating the file.
// Using a relative path to the repository-level fixture per instruction.
import golden from '../../../test-fixtures/golden.json';
import enterprise from '../../../test-fixtures/enterprise.json';
import pka from '../../../protocol/pka_vectors.json';

export type GoldenRecordCase = {
  name: string;
  raw: string;
  expected: AidRecord;
};

export type GoldenFixture = {
  records: GoldenRecordCase[];
  invalid?: { name: string; raw: string; errorCode?: string }[];
  recordSets?: Array<{
    name: string;
    records: string[];
    expectedSelected?: AidRecord;
    expectedErrorCode?: string;
    metadata?: Record<string, unknown>;
  }>;
};

export const fixtures: GoldenFixture = golden as unknown as GoldenFixture;

export type EnterprisePolicyCase = {
  name: string;
  runtime: 'node' | 'browser';
  queryName: string;
  options: Record<string, unknown>;
  dns: {
    answers?: Array<{ name: string; data: string; ttl: number }>;
    errorCode?: string;
    ad?: boolean;
  };
  wellKnown?: {
    body?: Record<string, unknown>;
  };
  expect: {
    errorCode?: string;
    warningCodes?: string[];
  };
};

export type EnterpriseFixture = {
  securityPolicies: EnterprisePolicyCase[];
};

export const enterpriseFixtures: EnterpriseFixture = enterprise as unknown as EnterpriseFixture;

export type PkaVector = {
  id: string;
  desc: string;
  record: Record<string, unknown>;
  key: Record<string, unknown>;
  request?: Record<string, unknown>;
  response?: {
    status?: number;
    cache_control?: string;
    signature_input?: string;
    signature?: string;
  };
  covered: string[];
  signature_base?: string;
  created: number;
  expires?: number;
  nonce?: string;
  expect: 'pass' | 'fail';
};

export type PkaVectorFixture = {
  version: number;
  vectors: PkaVector[];
};

export const pkaVectors: PkaVectorFixture = pka as unknown as PkaVectorFixture;
