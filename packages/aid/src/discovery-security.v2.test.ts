import { describe, expect, it, vi } from 'vitest';
import {
  createDiscoverySecurity,
  enforceDowngradePolicy,
  resolveSecurityPolicy,
} from './discovery-security.js';

const LEGACY_ZERO_PKA = `z${'1'.repeat(32)}`;
const ZERO_JWK_X = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const ZERO_JWK_THUMBPRINT = 'ogRZbCR5KTrPFCAfuYmCMwj0w7Yuk3Lr6YWQWfpkbf0';

describe('AID v2 discovery security state', () => {
  it('does not flag aid1 to aid2 when the raw Ed25519 key is unchanged', async () => {
    const policy = resolveSecurityPolicy({
      downgradePolicy: 'fail',
      previousSecurity: {
        version: 'aid1',
        trustSource: 'dns',
        pka: LEGACY_ZERO_PKA,
        kid: 'g1',
      },
    });
    const security = createDiscoverySecurity(policy, false);

    await expect(
      enforceDowngradePolicy(
        {
          v: 'aid2',
          uri: 'https://api.example.com/mcp',
          proto: 'mcp',
          pka: ZERO_JWK_X,
        },
        '_agent.example.com',
        policy,
        security,
      ),
    ).resolves.toBeUndefined();

    expect(security.downgrade.detected).toBe(false);
  });

  it('fails aid2 to aid1 version downgrade when policy requires it', async () => {
    const policy = resolveSecurityPolicy({
      downgradePolicy: 'fail',
      previousSecurity: {
        version: 'aid2',
        trustSource: 'dns',
        keyThumbprints: [ZERO_JWK_THUMBPRINT],
      },
    });
    const security = createDiscoverySecurity(policy, false);

    await expect(
      enforceDowngradePolicy(
        {
          v: 'aid1',
          uri: 'https://api.example.com/mcp',
          proto: 'mcp',
        },
        '_agent.example.com',
        policy,
        security,
      ),
    ).rejects.toMatchObject({ errorCode: 'ERR_SECURITY' });

    expect(security.downgrade.detected).toBe(true);
    expect(security.downgrade.reason).toBe('version downgraded from aid2 to aid1');
  });

  it('warns when DNS trust is replaced by well-known TLS fallback', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const policy = resolveSecurityPolicy({
      downgradePolicy: 'warn',
      previousSecurity: {
        version: 'aid2',
        trustSource: 'dns',
        keyThumbprints: [ZERO_JWK_THUMBPRINT],
      },
    });
    const security = createDiscoverySecurity(policy, true);

    await enforceDowngradePolicy(
      {
        v: 'aid2',
        uri: 'https://api.example.com/mcp',
        proto: 'mcp',
        pka: ZERO_JWK_X,
      },
      'https://example.com/.well-known/agent',
      policy,
      security,
    );

    expect(security.downgrade.detected).toBe(true);
    expect(security.downgrade.reason).toBe('DNS record unavailable; using well-known-tls trust');
    expect(security.warnings.map((warning) => warning.code)).toEqual(['DOWNGRADE_DETECTED']);
    warn.mockRestore();
  });
});
