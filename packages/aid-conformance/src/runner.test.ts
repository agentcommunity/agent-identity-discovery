import { describe, expect, it } from 'vitest';
import {
  fixtures,
  enterpriseFixtures,
  pkaVectors,
  type EnterpriseFixture,
  type GoldenFixture,
  type PkaVector,
  type PkaVectorFixture,
} from './index.js';
import { runFixture } from './runner.js';

const emptyFixture: GoldenFixture = { records: [] };

function validAid2PkaVector(): PkaVector {
  const vector = pkaVectors.vectors.find(
    (candidate) => candidate.id === 'v2-rfc9421-response-signature',
  );
  if (!vector) throw new Error('missing valid aid2 PKA fixture');
  return vector;
}

describe('aid-conformance runner', () => {
  it('reports v2 record sets, PKA vectors, and enterprise policy vectors', async () => {
    const result = await runFixture(fixtures, { pkaVectors, enterpriseFixtures });

    expect(result.categories.records.total).toBeGreaterThan(0);
    expect(result.categories.invalid.total).toBeGreaterThan(0);
    expect(result.categories.recordSets.total).toBeGreaterThan(0);
    expect(result.categories.pkaVectors.total).toBeGreaterThan(0);
    expect(result.categories.enterprisePolicies.total).toBeGreaterThan(0);
  });

  it('fails PKA pass vectors that lack required v2 proof material', async () => {
    const invalidPkaVectors: PkaVectorFixture = {
      version: 1,
      vectors: [
        {
          id: 'pka-pass-without-proof',
          desc: 'A pass vector cannot omit the nonce-bound response proof',
          record: {
            v: 'aid2',
            u: 'https://api.example.com/mcp?check=1',
            p: 'mcp',
            k: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
          },
          key: {
            public_x: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
            jwk_thumbprint: 'WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk',
          },
          covered: ['@method;req', '@target-uri;req', '@authority;req', '@status'],
          created: 1767139200,
          expect: 'pass',
        },
      ],
    };

    const result = await runFixture(emptyFixture, { pkaVectors: invalidPkaVectors });

    expect(result.categories.pkaVectors).toEqual({ total: 1, passed: 0, failed: 1 });
  });

  it('fails PKA pass vectors with an invalid v2 response signature', async () => {
    const vector = validAid2PkaVector();
    if (!vector.response?.signature) throw new Error('missing valid aid2 PKA signature');
    const invalidPkaVectors: PkaVectorFixture = {
      version: 1,
      vectors: [
        {
          ...vector,
          id: 'v2-invalid-response-signature',
          desc: 'A pass vector cannot include a signature that does not verify',
          response: {
            ...vector.response,
            signature: vector.response.signature.replace('Tymq', 'Aymq'),
          },
        },
      ],
    };

    const result = await runFixture(emptyFixture, { pkaVectors: invalidPkaVectors });

    expect(result.categories.pkaVectors).toEqual({ total: 1, passed: 0, failed: 1 });
  });

  it('fails PKA pass vectors with a mismatched v2 signature base', async () => {
    const vector = validAid2PkaVector();
    if (!vector.signature_base) throw new Error('missing valid aid2 PKA signature base');
    const invalidPkaVectors: PkaVectorFixture = {
      version: 1,
      vectors: [
        {
          ...vector,
          id: 'v2-mismatched-signature-base',
          desc: 'A pass vector cannot include a signature base that was not signed',
          signature_base: vector.signature_base.replace(': GET', ': POST'),
        },
      ],
    };

    const result = await runFixture(emptyFixture, { pkaVectors: invalidPkaVectors });

    expect(result.categories.pkaVectors).toEqual({ total: 1, passed: 0, failed: 1 });
  });

  it('fails record sets when the only preferred-version selection differs from expectedSelected', async () => {
    const fixture: GoldenFixture = {
      records: [],
      recordSets: [
        {
          name: 'single-aid2-selection-must-match-expected',
          records: ['v=aid2;u=https://selected.example.com/mcp;p=mcp'],
          expectedSelected: {
            v: 'aid2',
            uri: 'https://different.example.com/mcp',
            proto: 'mcp',
          },
        },
      ],
    };

    const result = await runFixture(fixture);

    expect(result.categories.recordSets).toEqual({ total: 1, passed: 0, failed: 1 });
  });

  it('fails ambiguous same-version record sets even when one record matches expectedSelected', async () => {
    const fixture: GoldenFixture = {
      records: [],
      recordSets: [
        {
          name: 'ambiguous-aid2-selection-fails',
          records: [
            'v=aid2;u=https://first.example.com/mcp;p=mcp',
            'v=aid2;u=https://second.example.com/mcp;p=mcp',
          ],
          expectedSelected: {
            v: 'aid2',
            uri: 'https://first.example.com/mcp',
            proto: 'mcp',
          },
        },
      ],
    };

    const result = await runFixture(fixture);

    expect(result.categories.recordSets).toEqual({ total: 1, passed: 0, failed: 1 });
  });

  it('accepts aid2 fail vectors that intentionally omit required covered fields', async () => {
    const negativePkaVectors: PkaVectorFixture = {
      version: 1,
      vectors: [
        {
          id: 'aid2-missing-covered-authority-fails',
          desc: 'Missing covered authority is an intentional negative aid2 vector',
          record: {
            v: 'aid2',
            u: 'https://api.example.com/mcp?check=1',
            p: 'mcp',
            k: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
          },
          key: {
            public_x: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
            jwk_thumbprint: 'WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk',
          },
          covered: ['@method;req', '@target-uri;req', '@status'],
          created: 1767139200,
          expect: 'fail',
        },
      ],
    };

    const result = await runFixture(emptyFixture, { pkaVectors: negativePkaVectors });

    expect(result.categories.pkaVectors).toEqual({ total: 1, passed: 1, failed: 0 });
  });

  it('fails fail PKA vectors that rely only on wording markers', async () => {
    const wordingOnlyNegativeVectors: PkaVectorFixture = {
      version: 1,
      vectors: [
        {
          ...validAid2PkaVector(),
          id: 'v2-invalid-label-only',
          desc: 'Invalid wording without malformed proof material',
          expect: 'fail',
        },
      ],
    };

    const result = await runFixture(emptyFixture, { pkaVectors: wordingOnlyNegativeVectors });

    expect(result.categories.pkaVectors).toEqual({ total: 1, passed: 0, failed: 1 });
  });

  it('fails PKA fixtures with duplicate vector ids', async () => {
    const duplicatePkaVectors: PkaVectorFixture = {
      version: 1,
      vectors: [
        {
          id: 'duplicate-pka-id',
          desc: 'First vector',
          record: { v: 'aid1', u: 'https://api.example.com/mcp', p: 'mcp', i: 'g1' },
          key: { public: 'z1111111111111111111111111111111111111111111' },
          covered: ['AID-Challenge', '@method', '@target-uri', 'host', 'date'],
          created: 1735689600,
          httpDate: 'Thu, 01 Jan 2026 00:00:00 GMT',
          expect: 'pass',
        },
        {
          id: 'duplicate-pka-id',
          desc: 'Second vector repeats the id',
          record: { v: 'aid1', u: 'https://api.example.com/mcp', p: 'mcp', i: 'g1' },
          key: { public: 'z1111111111111111111111111111111111111111111' },
          covered: ['AID-Challenge', '@method', '@target-uri', 'host', 'date'],
          created: 1735689600,
          httpDate: 'Thu, 01 Jan 2026 00:00:00 GMT',
          expect: 'pass',
        },
      ],
    };

    const result = await runFixture(emptyFixture, { pkaVectors: duplicatePkaVectors });

    expect(result.categories.pkaVectors).toEqual({ total: 2, passed: 1, failed: 1 });
  });

  it('fails enterprise policies whose expected outcome conflicts with strict mode', async () => {
    const invalidEnterpriseFixture: EnterpriseFixture = {
      securityPolicies: [
        {
          name: 'strict-missing-pka-warning',
          runtime: 'node',
          queryName: '_agent.example.com',
          options: { securityMode: 'strict' },
          dns: {
            answers: [
              {
                name: '_agent.example.com',
                data: 'v=aid1;u=https://api.example.com/mcp;p=mcp',
                ttl: 300,
              },
            ],
          },
          expect: { warningCodes: ['DNSSEC_PREFERRED'] },
        },
      ],
    };

    const result = await runFixture(emptyFixture, {
      enterpriseFixtures: invalidEnterpriseFixture,
    });

    expect(result.categories.enterprisePolicies).toEqual({ total: 1, passed: 0, failed: 1 });
  });

  it('fails enterprise fixtures with duplicate policy names', async () => {
    const duplicateEnterpriseFixture: EnterpriseFixture = {
      securityPolicies: [
        {
          name: 'duplicate-enterprise-policy',
          runtime: 'node',
          queryName: '_agent.example.com',
          options: { securityMode: 'strict' },
          dns: {
            answers: [
              {
                name: '_agent.example.com',
                data: 'v=aid1;u=https://api.example.com/mcp;p=mcp',
                ttl: 300,
              },
            ],
          },
          expect: { errorCode: 'ERR_SECURITY' },
        },
        {
          name: 'duplicate-enterprise-policy',
          runtime: 'node',
          queryName: '_agent.example.org',
          options: { securityMode: 'strict' },
          dns: {
            answers: [
              {
                name: '_agent.example.org',
                data: 'v=aid1;u=https://api.example.org/mcp;p=mcp',
                ttl: 300,
              },
            ],
          },
          expect: { errorCode: 'ERR_SECURITY' },
        },
      ],
    };

    const result = await runFixture(emptyFixture, {
      enterpriseFixtures: duplicateEnterpriseFixture,
    });

    expect(result.categories.enterprisePolicies).toEqual({ total: 2, passed: 1, failed: 1 });
  });
});
