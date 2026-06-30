import { describe, expect, it } from 'vitest';
import {
  classifySecurityChange as engineClassifySecurityChange,
  type CacheEntry as EngineCacheEntry,
} from '@agentcommunity/aid-engine';
import { classifySecurityChange as doctorClassifySecurityChange, type CacheEntry } from './cache';

// The aid-engine checker and the aid-doctor cache must agree on every
// security-change classification. They previously held divergent copies; the
// doctor's omitted the derivePkaKeyid fallback and false-positived key_replaced
// for a previous entry that had pka set but keyid=null. These tests pin that the
// two entry points produce identical results across the contract surface.

// Same Ed25519 key in two equivalent encodings: aid2 base64url JWK `x` and its
// derived RFC 7638 thumbprint (keyid). A previous entry with the raw pka and a
// null keyid must classify as no_change against a current entry whose keyid is
// the thumbprint derived from that very key.
const SHARED_PKA = 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ';
const SHARED_KEYID = 'WWpn_pfHui9YKR4CZtQsDGMu7_Gch2zYChfSvnxgtPk';

function entry(overrides: Partial<CacheEntry> = {}): CacheEntry {
  return {
    lastSeen: '2026-06-01T00:00:00.000Z',
    version: 'aid2',
    trustSource: 'dns',
    pka: SHARED_PKA,
    kid: null,
    keyid: SHARED_KEYID,
    jwkX: SHARED_PKA,
    domainBound: null,
    ...overrides,
  };
}

const cases: Array<{
  name: string;
  previous: CacheEntry | null | undefined;
  current: CacheEntry;
}> = [
  {
    name: 'pka-set with keyid=null vs derived keyid is no_change (the parity-1 regression)',
    previous: entry({ keyid: null }),
    current: entry({ keyid: SHARED_KEYID }),
  },
  {
    name: 'both keyid=null but same pka is no_change',
    previous: entry({ keyid: null }),
    current: entry({ keyid: null }),
  },
  {
    name: 'first_seen when no previous',
    previous: null,
    current: entry(),
  },
  {
    name: 'pka_added',
    previous: entry({ pka: null, keyid: null }),
    current: entry(),
  },
  {
    name: 'pka_removed',
    previous: entry(),
    current: entry({ pka: null, keyid: null }),
  },
  {
    name: 'key_replaced for genuinely different keys',
    previous: entry({ keyid: null }),
    current: entry({
      pka: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      keyid: null,
      jwkX: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    }),
  },
  {
    name: 'version_downgrade aid2 -> aid1',
    previous: entry({ version: 'aid2' }),
    current: entry({ version: 'aid1', keyid: null }),
  },
  {
    name: 'fallback_well_known_tls',
    previous: entry(),
    current: entry({ trustSource: 'well-known-tls' }),
  },
  {
    name: 'binding_loss',
    previous: entry({ domainBound: true }),
    current: entry({ domainBound: false }),
  },
];

describe('classifySecurityChange engine/doctor parity', () => {
  it.each(cases)('agrees on $name', ({ previous, current }) => {
    const doctorResult = doctorClassifySecurityChange(previous, current);
    const engineResult = engineClassifySecurityChange(
      previous as EngineCacheEntry | null,
      current as EngineCacheEntry,
    );
    expect(doctorResult).toBe(engineResult);
  });

  it('does not false-positive key_replaced when previous has pka but keyid=null', () => {
    const previous = entry({ keyid: null });
    const current = entry({ keyid: SHARED_KEYID });
    expect(doctorClassifySecurityChange(previous, current)).toBe('no_change');
    expect(
      engineClassifySecurityChange(previous as EngineCacheEntry, current as EngineCacheEntry),
    ).toBe('no_change');
  });
});
