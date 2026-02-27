// Local shape of an AID record for conformance purposes
export type AidRecord = {
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

// Re-export the shared golden fixtures without duplicating the file.
// Using a relative path to the repository-level fixture per instruction.
import golden from '../../../test-fixtures/golden.json';
import enterprise from '../../../test-fixtures/enterprise.json';

export type GoldenRecordCase = {
  name: string;
  raw: string;
  expected: AidRecord;
};

export type GoldenFixture = {
  records: GoldenRecordCase[];
  invalid?: { name: string; raw: string; errorCode?: string }[];
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
