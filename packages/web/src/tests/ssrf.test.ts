import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { isPrivateHost, safeDiscoveryFetch } from '@/lib/api/ssrf';

describe('isPrivateHost', () => {
  const blocked: Array<[string, string]> = [
    ['localhost', 'localhost'],
    ['127.0.0.1', 'loopback /8'],
    ['127.0.0.2', 'full loopback /8, not just .1'],
    ['127.255.255.255', 'loopback /8 upper'],
    ['0.0.0.0', 'unspecified address'],
    ['10.0.0.1', 'RFC1918 10/8'],
    ['192.168.1.1', 'RFC1918 192.168/16'],
    ['172.16.0.1', 'RFC1918 172.16/12 low'],
    ['172.31.255.255', 'RFC1918 172.16/12 high'],
    ['169.254.169.254', 'link-local / cloud metadata'],
    ['169.254.0.1', 'link-local 169.254/16'],
    ['::1', 'IPv6 loopback'],
    ['[::1]', 'bracketed IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fe80::1', 'IPv6 link-local fe80::/10'],
    ['[fe80::abcd]', 'bracketed IPv6 link-local'],
    ['fc00::1', 'IPv6 ULA fc00::/7'],
    ['fd12:3456::1', 'IPv6 ULA fd00::/8'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['[::ffff:169.254.169.254]', 'IPv4-mapped link-local metadata'],
    ['fe80::1%eth0', 'IPv6 with zone id'],
  ];

  it.each(blocked)('blocks %s (%s)', (host) => {
    expect(isPrivateHost(host)).toBe(true);
  });

  const allowed: Array<[string, string]> = [
    ['example.com', 'public hostname'],
    ['aid.agentcommunity.org', 'public hostname'],
    ['8.8.8.8', 'public IPv4'],
    ['1.1.1.1', 'public IPv4'],
    ['172.15.0.1', 'just below 172.16/12'],
    ['172.32.0.1', 'just above 172.16/12'],
    ['192.169.0.1', 'just outside 192.168/16'],
    ['93.184.216.34', 'public IPv4 (example.com)'],
  ];

  it.each(allowed)('allows %s (%s)', (host) => {
    expect(isPrivateHost(host)).toBe(false);
  });

  it('treats an empty host as private', () => {
    expect(isPrivateHost('')).toBe(true);
  });
});

describe('safeDiscoveryFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the response when there is no redirect', async () => {
    const ok = new Response('hi', { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok as unknown as Response);

    const res = await safeDiscoveryFetch('https://example.com/.well-known/agent.json');
    expect(res.status).toBe(200);
    // redirect: 'manual' must be forced on the underlying fetch.
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/.well-known/agent.json',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('follows a redirect to another public host', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://other.example.com/card.json' },
        }) as unknown as Response,
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }) as unknown as Response);

    const res = await safeDiscoveryFetch('https://example.com/card.json');
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('refuses to follow a redirect into a private/link-local host', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data/' },
      }) as unknown as Response,
    );

    await expect(safeDiscoveryFetch('https://example.com/card.json')).rejects.toThrow(
      'Target host not allowed',
    );
  });

  it('refuses an initial private target before any fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(safeDiscoveryFetch('http://127.0.0.1/card.json')).rejects.toThrow(
      'Target host not allowed',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
