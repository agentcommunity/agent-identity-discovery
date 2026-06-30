import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Keep the route off the network: stub only `handleProtocol` (the network
// boundary) while preserving the rest of the protocol module — helpers like
// `isLocalScheme` are used by the validation/auth-mapping path under test.
vi.mock('@/lib/protocols', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/protocols')>();
  return { ...actual, handleProtocol: vi.fn() };
});
vi.mock('@/lib/api/handshake-security', () => ({
  getSecurityInfo: vi.fn(async () => {
    // Security enrichment is best-effort; return nothing in tests.
  }),
}));

import { POST } from '@/app/api/handshake/route';
import { handleProtocol } from '@/lib/protocols';

const mockedHandleProtocol = vi.mocked(handleProtocol);

const post = (body: unknown): Promise<Response> =>
  POST(
    new Request('https://aid.agentcommunity.org/api/handshake', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

describe('POST /api/handshake', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Any stray probe fetch in these tests should be a no-op, not a real call.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }) as unknown as Response,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SSRF host gate (locks in the isPrivateHost hardening)', () => {
    const blocked = [
      'http://127.0.0.1/',
      'http://127.0.0.2/', // full 127.0.0.0/8 loopback range
      'http://0.0.0.0/',
      'http://169.254.169.254/', // cloud metadata / link-local
      'http://10.0.0.1/',
      'http://192.168.1.1/',
      'http://172.16.0.1/',
      'http://[::1]/', // IPv6 loopback
      'http://[fe80::1]/', // IPv6 link-local
      'http://[fd00::1]/', // IPv6 ULA
      'http://[::ffff:127.0.0.1]/', // IPv4-mapped loopback
      'https://localhost/',
    ];

    it.each(blocked)('rejects private/link-local/loopback target %s with 400', async (uri) => {
      const res = await post({ uri, proto: 'mcp' });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { success: boolean; error: string };
      expect(body.success).toBe(false);
      expect(body.error).toBe('Target host not allowed');
      // The protocol handler must never run for a blocked host.
      expect(mockedHandleProtocol).not.toHaveBeenCalled();
    });
  });

  it('rejects an invalid JSON body with 400 "Invalid JSON body"', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { success: boolean; error: string };
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid JSON body');
  });

  it('returns 401 for an unsupported URI scheme under mcp', async () => {
    const res = await post({ uri: 'ftp://example.com/thing', proto: 'mcp' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      success: boolean;
      needsAuth: boolean;
      error: string;
    };
    expect(body.success).toBe(false);
    expect(body.needsAuth).toBe(true);
    expect(body.error).toContain('Unsupported URI scheme');
    expect(mockedHandleProtocol).not.toHaveBeenCalled();
  });

  it('maps a needsAuth protocol result to a 401 with needsAuth + authType', async () => {
    mockedHandleProtocol.mockResolvedValueOnce({
      success: false,
      proto: 'mcp',
      needsAuth: true,
      compliantAuth: false,
      error: '401 Unauthorized',
    });

    const res = await post({ uri: 'https://example.com/mcp', proto: 'mcp' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      success: boolean;
      needsAuth: boolean;
      authType: unknown;
    };
    expect(body.success).toBe(false);
    expect(body.needsAuth).toBe(true);
    expect(body).toHaveProperty('authType');
    expect(mockedHandleProtocol).toHaveBeenCalledTimes(1);
  });

  it('returns the success payload for a successful protocol result', async () => {
    mockedHandleProtocol.mockResolvedValueOnce({
      success: true,
      proto: 'mcp',
      data: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'Server', version: '1.0.0' },
        capabilities: [],
      },
    });

    const res = await post({ uri: 'https://example.com/mcp', proto: 'mcp' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; proto: string };
    expect(body.success).toBe(true);
    expect(body.proto).toBe('mcp');
  });
});
