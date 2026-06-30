import { describe, it, expect } from 'vitest';
import { tlsVariant, pkaVariant } from '@/lib/security-helpers';

describe('security-helpers', () => {
  it('tlsVariant returns success for valid with ample days', () => {
    const result = tlsVariant(true, 100);
    expect(result).toBe('success');
  });
  it('tlsVariant returns warning when expiring soon', () => {
    const result = tlsVariant(true, 7);
    expect(result).toBe('warning');
  });
  it('tlsVariant returns error when invalid', () => {
    const result = tlsVariant(false, null);
    expect(result).toBe('error');
  });
  it('pkaVariant success when verified', () => {
    const result = pkaVariant(true, true);
    expect(result).toBe('success');
  });
  it('pkaVariant warning when present but not verified', () => {
    const result = pkaVariant(true, null);
    expect(result).toBe('warning');
  });
  it('pkaVariant info when not present', () => {
    const result = pkaVariant(false, null);
    expect(result).toBe('info');
  });
  it('pkaVariant success when domain-bound', () => {
    const result = pkaVariant(true, true, true);
    expect(result).toBe('success');
  });
});
