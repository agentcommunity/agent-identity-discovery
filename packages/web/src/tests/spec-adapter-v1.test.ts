import { describe, expect, it } from 'vitest';
import { v1Adapter } from '@/spec-adapters/v1';

describe('v1Adapter.normalizeHandshake — isCap guard', () => {
  it('does not throw on null/malformed capabilities and drops id-less resource caps', () => {
    const raw = {
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'Server', version: '1.0.0' },
      // null -> must not throw; {type:'resource'} with no id -> must be dropped;
      // a well-formed tool cap -> must survive.
      capabilities: [null, { type: 'resource' }, { id: 'x', type: 'tool' }],
    };

    let result: ReturnType<typeof v1Adapter.normalizeHandshake>;
    expect(() => {
      result = v1Adapter.normalizeHandshake(raw);
    }).not.toThrow();

    expect(result!).not.toBeNull();
    const caps = result!.capabilities;
    // Only the fully-formed tool capability should remain.
    expect(caps).toHaveLength(1);
    expect(caps[0]).toMatchObject({ id: 'x', type: 'tool' });
    // No capability may have an undefined id (violates CanonicalCapability.id: string).
    expect(caps.every((c) => typeof c.id === 'string' && c.id.length > 0)).toBe(true);
  });

  it('keeps a resource capability that has an id', () => {
    const result = v1Adapter.normalizeHandshake({
      protocolVersion: '2024-11-05',
      serverInfo: { name: 'Server', version: '1.0.0' },
      capabilities: [{ id: 'r1', type: 'resource', name: 'Res' }],
    });
    expect(result?.capabilities).toHaveLength(1);
    expect(result?.capabilities[0]).toMatchObject({ id: 'r1', type: 'resource' });
  });
});
