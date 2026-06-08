import { describe, expect, it } from 'vitest';

import { getDocBySlug } from '@/lib/docs';

describe('docs content routing', () => {
  it('resolves lowercase section aliases for generated docs routes', () => {
    expect(getDocBySlug('reference/pka')?.title).toBe('PKA Endpoint Proof');
    expect(getDocBySlug('understand/concepts')?.title).toBe('Core Concepts');
    expect(getDocBySlug('tooling/aid_doctor')?.title).toBe('aid-doctor CLI');
  });
});
