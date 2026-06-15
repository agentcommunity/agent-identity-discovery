import { describe, expect, it } from 'vitest';
import { validate } from '@/lib/generator/core';
import { validateGeneratorPayload } from '@/lib/api/generator-validation';

// WEB-CORE-003: dep validation must match the SDK parser semantics
// (`/Z$/.test(dep) && !Number.isNaN(Date.parse(dep))`) so the Generator UI and
// the canonical parser never disagree.

const base = {
  domain: 'example.com',
  uri: 'https://api.example.com/mcp',
  proto: 'mcp' as const,
  auth: '',
  desc: '',
};

const hasDepError = (errors: ReadonlyArray<{ code: string }>): boolean =>
  errors.some((e) => e.code === 'ERR_DEP_ISO');

describe('generator/core.validate — dep ISO 8601', () => {
  it('accepts fractional seconds (was a false negative)', () => {
    const result = validate({ ...base, dep: '2026-01-01T00:00:00.500Z' });
    expect(hasDepError(result.errors)).toBe(false);
  });

  it('rejects an impossible date such as month 13 (was a false positive)', () => {
    const result = validate({ ...base, dep: '2026-13-01T00:00:00Z' });
    expect(hasDepError(result.errors)).toBe(true);
  });

  it('rejects a timestamp without a trailing Z', () => {
    const result = validate({ ...base, dep: '2026-01-01T00:00:00' });
    expect(hasDepError(result.errors)).toBe(true);
  });

  it('accepts a plain UTC instant', () => {
    const result = validate({ ...base, dep: '2026-01-01T00:00:00Z' });
    expect(hasDepError(result.errors)).toBe(false);
  });
});

describe('api/generator-validation — dep ISO 8601 (same SDK semantics)', () => {
  it('accepts fractional seconds', () => {
    const result = validateGeneratorPayload({ ...base, dep: '2026-01-01T00:00:00.500Z' });
    expect(hasDepError(result.errors)).toBe(false);
  });

  it('rejects month 13', () => {
    const result = validateGeneratorPayload({ ...base, dep: '2026-13-01T00:00:00Z' });
    expect(hasDepError(result.errors)).toBe(true);
  });
});
