import { describe, expect, it } from 'vitest';
import { enterpriseFixtures, fixtures } from './index.js';

describe('aid-conformance fixtures', () => {
  it('should expose records with name/raw/expected', () => {
    expect(Array.isArray(fixtures.records)).toBe(true);
    for (const c of fixtures.records) {
      expect(typeof c.name).toBe('string');
      expect(typeof c.raw).toBe('string');
      expect(typeof c.expected).toBe('object');
      expect(c.expected).not.toBeNull();
      expect(c.expected.v).toBe('aid1');
      expect(typeof c.expected.uri).toBe('string');
      expect(typeof c.expected.proto).toBe('string');
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
});
