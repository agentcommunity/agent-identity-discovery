import { describe, expect, it } from 'vitest';
import { buildTxtRecord, parseRecordString, validate } from '@/lib/generator/core';
import { validateGeneratorPayload } from '@/lib/api/generator-validation';

// WEB-AIDGEN-004: the orphaned src/lib/aid-generator.ts (a third, divergent TXT
// builder/validator) was removed. It was the only one that rejected the legacy
// kid/i alias (aid2 disallows it). This test pins that rejection in the surviving
// generator surfaces — client core.ts and the authoritative server validator —
// so the behavior is not lost. Mirrors SDK parser.ts:322-324.

const base = {
  domain: 'example.com',
  uri: 'https://api.example.com/mcp',
  proto: 'mcp' as const,
  auth: '',
  desc: '',
};

const hasKidError = (errors: ReadonlyArray<{ code: string }>): boolean =>
  errors.some((e) => e.code === 'ERR_KID_NOT_ALLOWED');

describe('generator/core — kid/i rejection (aid2)', () => {
  it('buildTxtRecord never emits a legacy i= / kid= field', () => {
    const txt = buildTxtRecord({
      ...base,
      pka: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
    });
    expect(txt).toContain('v=aid2');
    expect(txt).not.toContain('i=');
    expect(txt).not.toContain('kid=');
  });

  it('parseRecordString never rehydrates a legacy i=/kid= alias into form state', () => {
    // aid2 disallows kid, so it must not round-trip into creator state or TXT.
    // (Also pinned by web-v2-surface.test.ts.)
    const parsed = parseRecordString('v=aid2;u=https://x.example/mcp;p=mcp;i=legacy;kid=legacy');
    expect(parsed).not.toHaveProperty('kid');
    expect(parsed).not.toHaveProperty('i');
  });

  it('validate rejects a record that carries a kid', () => {
    const result = validate({ ...base, kid: 'somekeyid' });
    expect(hasKidError(result.errors)).toBe(true);
    expect(result.isValid).toBe(false);
  });

  it('validate accepts a record with no kid', () => {
    const result = validate(base);
    expect(hasKidError(result.errors)).toBe(false);
  });
});

describe('api/generator-validation — kid/i rejection (same semantics)', () => {
  it('rejects a payload that carries a kid', () => {
    const result = validateGeneratorPayload({ ...base, kid: 'somekeyid' });
    expect(hasKidError(result.errors)).toBe(true);
    expect(result.success).toBe(false);
  });
});
