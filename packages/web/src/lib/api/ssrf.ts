/**
 * SSRF guard for server-side discovery fetches.
 *
 * This is the single, hardened source of truth for deciding whether a target
 * host is safe to fetch from a server-side proxy (the handshake route, the
 * protocol handlers, and the security enrichment lookup).
 *
 * It blocks loopback, link-local (incl. cloud metadata 169.254.169.254),
 * RFC 1918 private ranges, unique-local IPv6 (fc00::/7), the unspecified
 * address (0.0.0.0 / ::), and IPv4-mapped IPv6 forms of all of the above.
 *
 * Defense-in-depth note: the deployed Cloudflare Worker also sets the
 * `global_fetch_strictly_public` compatibility flag, which blocks private/
 * link-local fetches (re-evaluated on every redirect hop) at the platform
 * layer. That flag is the production saving grace, but it does not protect the
 * Node/local/self-hosted path — this helper is the portable app-level control.
 */

/** Strip a bracketed IPv6 literal (`[::1]` -> `::1`) and drop any zone id. */
function unwrapHost(host: string): string {
  let h = host.trim();
  if (h.startsWith('[') && h.endsWith(']')) {
    h = h.slice(1, -1);
  }
  // Drop IPv6 zone identifier (e.g. fe80::1%eth0)
  const pct = h.indexOf('%');
  if (pct !== -1) h = h.slice(0, pct);
  return h.toLowerCase();
}

/** Parse a dotted-quad IPv4 string into 4 octets, or null if not an IPv4. */
function parseIPv4(host: string): [number, number, number, number] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets as [number, number, number, number];
}

/** True if the dotted-quad octets fall in a private/loopback/link-local range. */
function isPrivateIPv4(octets: [number, number, number, number]): boolean {
  const [a, b] = octets;
  // 0.0.0.0/8 (incl. the unspecified address 0.0.0.0)
  if (a === 0) return true;
  // 127.0.0.0/8 loopback (the FULL range, not just 127.0.0.1)
  if (a === 127) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 link-local (AWS/GCP/Azure IMDS cloud metadata lives here)
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * Returns true if `host` (a URL hostname, possibly a bracketed IPv6 literal)
 * resolves to a non-public address and must NOT be fetched server-side.
 */
export function isPrivateHost(host: string): boolean {
  if (!host) return true;

  const h = unwrapHost(host);

  // Named loopback never goes out.
  if (h === 'localhost' || h === 'ip6-localhost' || h === 'ip6-loopback') return true;

  // --- IPv4 (dotted quad) ---
  const ipv4 = parseIPv4(h);
  if (ipv4) return isPrivateIPv4(ipv4);

  // --- IPv6 (only treat as IPv6 when it actually looks like one) ---
  if (h.includes(':')) {
    // IPv4-mapped / IPv4-compatible IPv6: ::ffff:127.0.0.1, ::ffff:169.254.169.254, etc.
    const lastColon = h.lastIndexOf(':');
    const tail = h.slice(lastColon + 1);
    const embedded = parseIPv4(tail);
    if (embedded) return isPrivateIPv4(embedded);

    // Compress double-colon and inspect the resulting groups for loopback/unspecified.
    const compact = h.replace(/^0+(?=[0-9a-f])/i, '');
    // Loopback ::1 (any representation that reduces to it)
    if (compact === '::1' || /^(0+:)*0*:?0*1$/i.test(h)) return true;
    // Unspecified :: / 0:0:0:0:0:0:0:0
    if (compact === '::' || /^(0+:)*0*:?0*$/i.test(h) || h === '0:0:0:0:0:0:0:0') return true;

    const firstGroup = h.split(':')[0];
    const head = firstGroup === '' ? '' : firstGroup.padStart(4, '0');
    // Unique-local addresses fc00::/7 -> first byte 0xFC or 0xFD
    if (head.startsWith('fc') || head.startsWith('fd')) return true;
    // Link-local fe80::/10 -> fe80..febf
    if (/^fe[89ab]/.test(head)) return true;

    // Any other IPv6 literal that isn't clearly public is treated as private,
    // since this proxy only ever needs to reach named public hosts.
    return true;
  }

  return false;
}

/**
 * Fetch a server-side discovery URL with `redirect: 'manual'`, re-running the
 * SSRF host check on every redirect `Location` before following it. Without
 * this, an allowlisted public host can 30x-redirect into a private/link-local
 * target (e.g. http://169.254.169.254/) and the platform-independent code path
 * would follow it, defeating the front-door host check.
 *
 * Throws if a redirect points at a private host, if too many redirects occur,
 * or if a redirect omits a usable `Location`.
 */
export async function safeDiscoveryFetch(
  input: string,
  init?: RequestInit,
  maxRedirects = 5,
): Promise<Response> {
  let currentUrl = input;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new Error(`Invalid discovery URL: ${currentUrl}`);
    }

    if (isPrivateHost(parsed.hostname)) {
      throw new Error('Target host not allowed');
    }

    const response = await fetch(currentUrl, { ...init, redirect: 'manual' });

    // 3xx with a Location is a redirect we must vet before following.
    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get('location');
    if (!isRedirect || !location) {
      return response;
    }

    // Resolve relative redirects against the current URL.
    currentUrl = new URL(location, currentUrl).toString();
  }

  throw new Error('Too many redirects');
}
