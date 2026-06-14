import { describe, expect, it } from 'vitest';
import { buildPkaMetadata } from '@/hooks/use-discovery';
import type { AidRecord } from '@agentcommunity/aid/browser';
import type { DiscoveryResult as LibDiscoveryResult } from '@agentcommunity/aid/browser';

describe('buildPkaMetadata', () => {
  it('derives verified=true and domainBound=true from a bound handshake result', () => {
    const parsed = { pka: 'someBase64UrlKey', v: 'aid2' } as unknown as AidRecord & { uri: string };
    const libResult = { pka: { domainBound: true } } as unknown as LibDiscoveryResult;
    const meta = buildPkaMetadata(parsed, libResult);
    expect(meta).toMatchObject({ present: true, verified: true, domainBound: true });
  });

  it('derives verified=true and domainBound=false for an unbound proof', () => {
    const parsed = { pka: 'someBase64UrlKey', v: 'aid2' } as unknown as AidRecord & { uri: string };
    const libResult = { pka: { domainBound: false } } as unknown as LibDiscoveryResult;
    const meta = buildPkaMetadata(parsed, libResult);
    expect(meta).toMatchObject({ present: true, verified: true, domainBound: false });
  });

  it('returns present=false and verified=null when no pka key in record', () => {
    const parsed = {} as unknown as AidRecord & { uri: string };
    const libResult = {} as unknown as LibDiscoveryResult;
    const meta = buildPkaMetadata(parsed, libResult);
    expect(meta.present).toBe(false);
    expect(meta.verified).toBeNull();
    expect(meta.domainBound).toBeUndefined();
  });

  it('returns present=true but verified=null when pka key present but no handshake result', () => {
    const parsed = { pka: 'someKey' } as unknown as AidRecord & { uri: string };
    const libResult = {} as unknown as LibDiscoveryResult;
    const meta = buildPkaMetadata(parsed, libResult);
    expect(meta.present).toBe(true);
    expect(meta.verified).toBeNull();
    expect(meta.domainBound).toBeUndefined();
  });
});
