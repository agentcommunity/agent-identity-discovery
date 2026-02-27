import { type AidRecord, DNS_TTL_MIN, SPEC_VERSION, DNS_SUBDOMAIN } from './constants';
import { AidError, parse, AidRecordValidator, canonicalizeRaw } from './parser';
import { performPKAHandshake } from './pka.js';
import {
  type DiscoverySecurity,
  type DnssecPolicy,
  type DowngradePolicy,
  type PkaPolicy,
  type PreviousSecurityState,
  type SecurityMode,
  type WellKnownPolicy,
  createDiscoverySecurity,
  enforceDnssecPolicy,
  enforceDowngradePolicy,
  enforcePkaPolicy,
  enforceWellKnownPolicy,
  resolveSecurityPolicy,
} from './discovery-security.js';
import { query } from 'dns-query';

/**
 * Options for Node.js discovery
 */
export interface DiscoveryOptions {
  /** Timeout for DNS query in milliseconds (default: 5000) */
  timeout?: number;
  /** Protocol-specific subdomain to try (optional). When provided, underscore and non-underscore forms are attempted. */
  protocol?: string;
  /** Enable .well-known fallback on ERR_NO_RECORD or ERR_DNS_LOOKUP_FAILED (default: true) */
  wellKnownFallback?: boolean;
  /** Timeout for .well-known fetch in milliseconds (default: 2000) */
  wellKnownTimeoutMs?: number;
  /** Enterprise security preset. */
  securityMode?: SecurityMode;
  /** DNSSEC policy for successful DNS answers. */
  dnssecPolicy?: DnssecPolicy;
  /** PKA presence policy for the final discovered record. */
  pkaPolicy?: PkaPolicy;
  /** Downgrade handling when previous security state is supplied. */
  downgradePolicy?: DowngradePolicy;
  /** `.well-known` fallback policy. */
  wellKnownPolicy?: WellKnownPolicy;
  /** Previously observed PKA/KID state for downgrade detection. */
  previousSecurity?: PreviousSecurityState;
}

function normalizeDomain(domain: string): string {
  try {
    return new URL(`http://${domain}`).hostname;
  } catch {
    return domain;
  }
}

function constructQueryName(domain: string, protocol?: string, useUnderscore = false): string {
  const normalized = normalizeDomain(domain);
  if (protocol) {
    const protoPart = useUnderscore ? `_${protocol}` : protocol;
    return `${DNS_SUBDOMAIN}.${protoPart}.${normalized}`;
  }
  return `${DNS_SUBDOMAIN}.${normalized}`;
}

function looksLikeAidRecord(raw: string): boolean {
  const pattern = new RegExp(
    String.raw`(?:^|;)\s*(?:v|version)\s*=\s*${SPEC_VERSION}(?:\s*(?:;|$))`,
    'i',
  );
  return pattern.test(raw);
}

/**
 * Build a canonical RawAidRecord from JSON that may include alias keys
 */
/*
function canonicalizeRaw(json: Record<string, unknown>): RawAidRecord {
  const out: RawAidRecord = {};
  const getStr = (k: string) =>
    typeof json[k] === 'string' ? (json[k] as string).trim() : undefined;
  // Only set fields when defined to comply with exactOptionalPropertyTypes
  const v = getStr('v');
  if (v !== undefined) out.v = v;
  const uri = getStr('uri') ?? getStr('u');
  if (uri !== undefined) out.uri = uri;
  const proto = getStr('proto') ?? getStr('p');
  if (proto !== undefined) out.proto = proto;
  const auth = getStr('auth') ?? getStr('a');
  if (auth !== undefined) out.auth = auth;
  const desc = getStr('desc') ?? getStr('s');
  if (desc !== undefined) out.desc = desc;
  const docs = getStr('docs') ?? getStr('d');
  if (docs !== undefined) out.docs = docs;
  const dep = getStr('dep') ?? getStr('e');
  if (dep !== undefined) out.dep = dep;
  const pka = getStr('pka') ?? getStr('k');
  if (pka !== undefined) out.pka = pka;
  const kid = getStr('kid') ?? getStr('i');
  if (kid !== undefined) out.kid = kid;
  return out;
}
*/

// Minimal fetch/response types to avoid DOM lib dependency
type HeadersLike = { get(name: string): string | null };
type ResponseLike = { ok: boolean; status: number; headers: HeadersLike; text(): Promise<string> };
type FetchInit = { signal?: unknown; redirect?: 'error' | 'follow' | 'manual' };
type FetchLike = (input: string, init?: FetchInit) => Promise<ResponseLike>;
type DnssecResponse = { Status: number; AD?: boolean };

async function queryDnssecStatus(queryName: string, timeoutMs: number): Promise<boolean | null> {
  const fetchImpl = (globalThis as unknown as { fetch?: FetchLike }).fetch;
  if (typeof fetchImpl !== 'function') {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL('https://cloudflare-dns.com/dns-query');
    url.searchParams.set('name', queryName);
    url.searchParams.set('type', 'TXT');
    const res = (await fetchImpl(url.toString(), {
      signal: controller.signal as unknown,
      redirect: 'error',
    })) as ResponseLike;
    if (!res.ok) {
      return null;
    }
    const parsed = JSON.parse(await res.text()) as DnssecResponse;
    if (parsed.Status !== 0) {
      return false;
    }
    return parsed.AD === true;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWellKnown(
  domain: string,
  timeoutMs = 2000,
  options: DiscoveryOptions = {},
): Promise<{
  record: AidRecord;
  raw: string;
  queryName: string;
  security: DiscoverySecurity;
}> {
  const policy = resolveSecurityPolicy(options);
  const security = createDiscoverySecurity(policy, true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Preserve port (and IPv6 brackets) when building the well-known URL
  const parsedForHost = new URL(`http://${domain}`);
  const host = parsedForHost.host; // includes :port when present
  const insecure =
    typeof process !== 'undefined' &&
    process.env &&
    process.env.AID_ALLOW_INSECURE_WELL_KNOWN === '1';
  const scheme = insecure ? 'http' : 'https';
  // Work around IPv6 localhost resolution quirks in some Node fetch stacks by preferring IPv4
  const correctedHost =
    insecure && parsedForHost.hostname === 'localhost'
      ? parsedForHost.port
        ? `127.0.0.1:${parsedForHost.port}`
        : '127.0.0.1'
      : host;
  const url = `${scheme}://${correctedHost}/.well-known/agent`;
  enforceWellKnownPolicy(security, url);
  try {
    const fetchImpl = (globalThis as unknown as { fetch?: FetchLike }).fetch;
    if (typeof fetchImpl !== 'function') {
      throw new AidError('ERR_FALLBACK_FAILED', 'fetch is not available in this environment');
    }
    const res = (await fetchImpl(url, {
      signal: controller.signal as unknown,
      redirect: 'error',
    })) as ResponseLike;
    const text = await res.text(); // Await text early for snippet
    if (!res.ok) {
      throw new AidError('ERR_FALLBACK_FAILED', `Well-known HTTP ${res.status}`, {
        httpStatus: res.status,
        snippet: text.slice(0, 1024),
      });
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('application/json')) {
      throw new AidError(
        'ERR_FALLBACK_FAILED',
        'Invalid content-type for well-known (expected application/json)',
        {
          httpStatus: res.status,
          contentType: res.headers.get('content-type'),
          snippet: text.slice(0, 1024),
        },
      );
    }
    if (text.length > 64 * 1024) {
      throw new AidError('ERR_FALLBACK_FAILED', 'Well-known response too large (>64KB)', {
        httpStatus: res.status,
        contentType: ct,
        byteLength: text.length,
      });
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AidError('ERR_FALLBACK_FAILED', 'Invalid JSON in well-known response', {
        httpStatus: res.status,
        contentType: ct,
        snippet: text.slice(0, 1024),
      });
    }
    if (typeof json !== 'object' || json === null) {
      throw new AidError('ERR_FALLBACK_FAILED', 'Well-known JSON must be an object', {
        httpStatus: res.status,
        contentType: ct,
        snippet: text.slice(0, 1024),
      });
    }
    const raw = canonicalizeRaw(json as Record<string, unknown>);
    // Strict validation first
    let record: AidRecord;
    try {
      record = AidRecordValidator.validate(raw);
    } catch (err) {
      // Narrow relaxation: allow loopback HTTP only for well-known when explicitly enabled
      const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedForHost.hostname);
      const isHttpRemote = typeof raw.uri === 'string' && raw.uri.startsWith('http://');
      const isRemoteProto =
        typeof raw.proto === 'string' && !['local', 'zeroconf', 'websocket'].includes(raw.proto);
      const allowInsecure = insecure && isLoopback && isHttpRemote && isRemoteProto;
      if (!allowInsecure) throw err;
      // Validate all other fields by temporarily upgrading the URI scheme for validation
      const rawHttps = {
        ...raw,
        uri: (raw.uri as string).replace(/^http:\/\//, 'https://'),
      } as Record<string, unknown>;
      const validated = AidRecordValidator.validate(rawHttps);
      // Construct the final record but restore the original http URI
      record = { ...validated, uri: raw.uri! } as AidRecord;
    }
    if (record.dep) {
      const depDate = new Date(record.dep);
      if (!Number.isNaN(depDate.getTime())) {
        if (depDate.getTime() < Date.now()) {
          throw new AidError(
            'ERR_INVALID_TXT',
            `Record for ${domain} was deprecated on ${record.dep}`,
          );
        }

        console.warn(
          `[AID] WARNING: Record for ${domain} is scheduled for deprecation on ${record.dep}`,
        );
      }
    }
    if (record.pka) {
      try {
        await performPKAHandshake(record.uri, record.pka, record.kid ?? '');
      } catch (pkaError) {
        // Preserve ERR_SECURITY errors from PKA verification
        if (pkaError instanceof AidError && pkaError.errorCode === 'ERR_SECURITY') {
          throw pkaError;
        }
        throw pkaError;
      }
    }
    enforcePkaPolicy(record, url, security);
    enforceDowngradePolicy(record, url, policy, security);
    return { record, raw: text.trim(), queryName: url, security };
  } catch (e) {
    if (e instanceof AidError) {
      // Preserve ERR_SECURITY errors from PKA verification, don't convert to ERR_FALLBACK_FAILED
      if (e.errorCode === 'ERR_SECURITY') {
        throw e;
      }
      // Re-throw with fallback code if it's not already set and not a security error
      if (e.errorCode !== 'ERR_FALLBACK_FAILED') {
        throw new AidError('ERR_FALLBACK_FAILED', e.message, e.details);
      }
      throw e;
    }
    throw new AidError('ERR_FALLBACK_FAILED', e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Result of a successful discovery query.
 */
export interface DiscoveryResult {
  /** The parsed and validated AID record. */
  record: AidRecord;
  /** The raw, unparsed TXT record string. */
  raw: string;
  /** The TTL (Time-To-Live) of the DNS record, in seconds. */
  ttl: number;
  /** The DNS name that was queried */
  queryName: string;
  /** Security policy evaluation for the chosen result. */
  security: DiscoverySecurity;
}

/**
 * Discover an AID record for the given domain
 */
export async function discover(
  domain: string,
  options: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  const { protocol, timeout = 5000, wellKnownFallback = true, wellKnownTimeoutMs = 2000 } = options;
  const policy = resolveSecurityPolicy(options);

  // helper to perform single DNS query for a given name
  const queryOnce = async (queryName: string): Promise<DiscoveryResult> => {
    try {
      const response = await query(
        {
          question: { type: 'TXT', name: queryName },
        },
        // Use public resolvers for CI environments where the special "dns" alias may be unavailable
        {
          endpoints: ['1.1.1.1', '8.8.8.8'],
        },
      );

      if (response.rcode !== 'NOERROR' || !response.answers || response.answers.length === 0) {
        throw new AidError('ERR_NO_RECORD', `No TXT record found for ${queryName}`);
      }

      const validRecords: Array<Omit<DiscoveryResult, 'security'>> = [];
      let lastAidError: AidError | null = null;

      for (const answer of response.answers) {
        // Ensure we are looking at a TXT record
        if (answer.type !== 'TXT' || !answer.data) continue;

        // Data can be a buffer or an array of buffers. Standardize to array.
        const parts = Array.isArray(answer.data) ? answer.data : [answer.data];
        const raw = parts.map((p) => p.toString()).join('');
        const rawTrimmed = raw.trim();

        if (!looksLikeAidRecord(rawTrimmed)) continue;

        try {
          const record = parse(rawTrimmed);
          if (record.dep) {
            const depDate = new Date(record.dep);
            if (!Number.isNaN(depDate.getTime())) {
              if (depDate.getTime() < Date.now()) {
                throw new AidError(
                  'ERR_INVALID_TXT',
                  `Record for ${queryName} was deprecated on ${record.dep}`,
                );
              }

              console.warn(
                `[AID] WARNING: Record for ${queryName} is scheduled for deprecation on ${record.dep}`,
              );
            }
          }
          validRecords.push({
            record,
            raw: rawTrimmed,
            ttl: answer.ttl ?? DNS_TTL_MIN,
            queryName,
          });
        } catch (parseError) {
          if (parseError instanceof AidError) {
            lastAidError = parseError;
            continue;
          }
          throw new AidError('ERR_INVALID_TXT', (parseError as Error).message);
        }
      }

      if (validRecords.length === 1) {
        const result = validRecords[0];
        if (result.record.pka) {
          await performPKAHandshake(result.record.uri, result.record.pka, result.record.kid ?? '');
        }
        const security = createDiscoverySecurity(policy, false);
        enforcePkaPolicy(result.record, queryName, security);
        enforceDowngradePolicy(result.record, queryName, policy, security);
        if (policy.dnssecPolicy !== 'off') {
          const validated = await queryDnssecStatus(queryName, timeout);
          enforceDnssecPolicy(security, queryName, validated);
        }
        return { ...result, security };
      }

      if (validRecords.length > 1) {
        throw new AidError(
          'ERR_INVALID_TXT',
          `Multiple valid AID records found for ${queryName}; publish exactly one valid record per queried DNS name`,
        );
      }

      if (lastAidError) throw lastAidError;

      throw new AidError('ERR_NO_RECORD', `No valid AID record found for ${queryName}`);
    } catch (error: unknown) {
      if (error instanceof AidError) {
        throw error;
      }

      // Handle DNS-specific errors with robust code checking
      const dnsError = error as { code?: string; message: string };
      if (
        dnsError.code === 'ENOTFOUND' ||
        dnsError.code === 'ENODATA' ||
        dnsError.code === 'NXDOMAIN'
      ) {
        throw new AidError(
          'ERR_NO_RECORD',
          `Domain not found or no record available for: ${domain}`,
        );
      }

      // Fallback for other errors
      throw new AidError(
        'ERR_DNS_LOOKUP_FAILED',
        (error as Error).message || 'An unknown DNS lookup error occurred',
      );
    }
  };

  const baseName = constructQueryName(domain);

  const runDns = async (): Promise<DiscoveryResult> => {
    // Canonical: base _agent.<domain> query
    // If protocol is explicitly requested, attempt protocol-specific subdomains afterwards
    if (!protocol) {
      return await Promise.race([
        queryOnce(baseName),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new AidError('ERR_DNS_LOOKUP_FAILED', `DNS query timeout for ${baseName}`)),
            timeout,
          ),
        ),
      ]);
    }

    // Protocol explicitly requested: try underscore form first, then fall back to base
    const protoNameUnderscore = constructQueryName(domain, protocol, true);

    // 1) underscore form
    try {
      return await Promise.race([
        queryOnce(protoNameUnderscore),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new AidError(
                  'ERR_DNS_LOOKUP_FAILED',
                  `DNS query timeout for ${protoNameUnderscore}`,
                ),
              ),
            timeout,
          ),
        ),
      ]);
    } catch (error) {
      if (!(error instanceof AidError) || error.errorCode !== 'ERR_NO_RECORD') {
        throw error;
      }
    }

    // 2) fallback to base
    return await Promise.race([
      queryOnce(baseName),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new AidError('ERR_DNS_LOOKUP_FAILED', `DNS query timeout for ${baseName}`)),
          timeout,
        ),
      ),
    ]);
  };

  try {
    return await runDns();
  } catch (error) {
    if (
      wellKnownFallback &&
      policy.wellKnownPolicy !== 'disable' &&
      error instanceof AidError &&
      (error.errorCode === 'ERR_NO_RECORD' || error.errorCode === 'ERR_DNS_LOOKUP_FAILED')
    ) {
      try {
        const { record, raw, queryName, security } = await fetchWellKnown(
          domain,
          wellKnownTimeoutMs,
          options,
        );
        return { record, raw, ttl: DNS_TTL_MIN, queryName, security };
      } catch (fallbackError) {
        if (fallbackError instanceof AidError) {
          // Propagate rich details from the fallback
          throw fallbackError;
        }
        throw error; // Throw original DNS error if fallback has an unknown error
      }
    }
    throw error;
  }
}

/**
 * Discover multiple agents from a list of domains
 *
 * @param domains - Array of domains to discover
 * @returns Promise resolving to array of discovery results
 */
export async function discoverMultiple(
  domains: string[],
  options: DiscoveryOptions = {},
): Promise<DiscoveryResult[]> {
  const results = await Promise.allSettled(domains.map((domain) => discover(domain, options)));

  const successful: DiscoveryResult[] = [];
  const failed: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      successful.push(result.value);
    } else {
      failed.push(domains[i]);
    }
  }

  return successful;
}

/**
 * Test if a domain has an AID record without parsing it
 *
 * @param domain - The domain to test
 * @returns Promise resolving to true if an AID record exists
 */
export async function hasAidRecord(
  domain: string,
  options: DiscoveryOptions = {},
): Promise<boolean> {
  try {
    await discover(domain, options);
    return true;
  } catch {
    return false;
  }
}
