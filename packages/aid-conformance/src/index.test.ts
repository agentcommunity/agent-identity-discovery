import { describe, expect, it } from 'vitest';
import { enterpriseFixtures, fixtures, pkaVectors } from './index.js';

describe('aid-conformance fixtures', () => {
  it('should expose records with name/raw/expected', () => {
    expect(Array.isArray(fixtures.records)).toBe(true);
    for (const c of fixtures.records) {
      expect(typeof c.name).toBe('string');
      expect(typeof c.raw).toBe('string');
      expect(typeof c.expected).toBe('object');
      expect(c.expected).not.toBeNull();
      expect(['aid1', 'aid2']).toContain(c.expected.v);
      expect(typeof c.expected.uri).toBe('string');
      expect(typeof c.expected.proto).toBe('string');
      if (c.expected.v === 'aid2') {
        expect(c.expected).not.toHaveProperty('kid');
      }
    }
  });

  it('should expose enterprise security policy vectors', () => {
    expect(Array.isArray(enterpriseFixtures.securityPolicies)).toBe(true);
    for (const c of enterpriseFixtures.securityPolicies) {
      expect(typeof c.name).toBe('string');
      expect(c.runtime === 'node' || c.runtime === 'browser').toBe(true);
      expect(typeof c.queryName).toBe('string');
      expect(typeof c.options).toBe('object');
      expect(typeof c.expect).toBe('object');
    }
  });

  it('should expose v2 parser and migration fixtures for review gaps', () => {
    expect(fixtures.records.map((record) => record.name)).toContain('v2-ipv6-authority');
    expect(fixtures.invalid?.map((record) => record.name)).toEqual(
      expect.arrayContaining(['v2-duplicate-pka-alias', 'unknown-future-version']),
    );
    expect(fixtures.recordSets?.map((recordSet) => recordSet.name)).toEqual(
      expect.arrayContaining([
        'aid1-aid2-coexistence-prefers-aid2',
        'valid-aid2-with-malformed-aid2-selects-valid-aid2',
        'malformed-aid2-with-valid-aid1-selects-aid1',
        'only-malformed-aid-like-txt-no-well-known-fallback',
        'unknown-future-version-ignored-when-aid2-present',
      ]),
    );
  });

  it('should expose v2 PKA edge vectors for conformance consumers', () => {
    const ids = pkaVectors.vectors.map((vector) => vector.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'v2-rfc9421-response-signature',
        'v2-keyid-thumbprint-mismatch',
        'v2-uppercase-alg',
        'v2-duplicate-signature-input-param',
        'v2-duplicate-aid-pka-signature-input-member',
        'v2-missing-cache-control-no-store',
        'v2-missing-expires',
        'v2-long-expires-window',
        'v2-ipv6-authority',
        // Domain-binding (one-tag) vectors: a pass vector that covers aid-domain
        // and a cross-domain forgery fail vector. Pinning their presence guards
        // against a future edit dropping or mislabelling them.
        'v2-db-rfc9421-domain-bound',
        'v2-db-domain-mismatch',
      ]),
    );

    const uppercase = pkaVectors.vectors.find((vector) => vector.id === 'v2-uppercase-alg');
    expect(uppercase?.expect).toBe('pass');
    expect(uppercase?.response?.signature_input).toContain('alg="ED25519"');
  });

  it('should expose well-known-tls returning-client downgrade vectors', () => {
    const names = enterpriseFixtures.securityPolicies.map((policy) => policy.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'node-well-known-tls-downgrade-warn',
        'node-well-known-tls-downgrade-fail',
      ]),
    );
  });
});
