import { type AidRecord, DNS_TTL_MIN, SPEC_VERSION, DNS_SUBDOMAIN } from './constants';
import { AidError, parse, AidRecordValidator, canonicalizeRaw } from './parser';
import { performPKAHandshake } from './pka.js';
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

async function fetchWellKnown(
  domain: string,
  timeoutMs = 2000,
): Promise<{
  record: AidRecord;
  raw: string;
  queryName: string;
}> {
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
    return { record, raw: text.trim(), queryName: url };
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
}

/**
 * Discover an AID record for the given domain
 */
export async function discover(
  domain: string,
  options: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  const { protocol, timeout = 5000, wellKnownFallback = true, wellKnownTimeoutMs = 2000 } = options;

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

      for (const answer of response.answers) {
        // Ensure we are looking at a TXT record
        if (answer.type !== 'TXT' || !answer.data) continue;

        // Data can be a buffer or an array of buffers. Standardize to array.
        const parts = Array.isArray(answer.data) ? answer.data : [answer.data];
        const raw = parts.map((p) => p.toString()).join('');
        const rawTrimmed = raw.trim();

        // Check if it looks like an AID record before trying to parse (ignore leading whitespace)
        if (rawTrimmed.toLowerCase().startsWith(`v=${SPEC_VERSION}`)) {
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
            if (record.pka) {
              await performPKAHandshake(record.uri, record.pka, record.kid ?? '');
            }
            // Success! Return the parsed record, raw string, and TTL.
            return {
              record,
              raw: rawTrimmed,
              ttl: answer.ttl ?? DNS_TTL_MIN,
              queryName,
            };
          } catch (parseError) {
            // This record looked like an AID record but failed validation.
            if (parseError instanceof AidError) throw parseError;
            throw new AidError('ERR_INVALID_TXT', (parseError as Error).message);
          }
        }
      }

      // If the loop completes without finding a valid AID record
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
    const queryWithTimeout = async (queryName: string): Promise<DiscoveryResult> =>
      await Promise.race([
        queryOnce(queryName),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(new AidError('ERR_DNS_LOOKUP_FAILED', `DNS query timeout for ${queryName}`)),
            timeout,
          ),
        ),
      ]);

    // Canonical: base _agent.<domain> query when no protocol is requested.
    if (!protocol) {
      return await queryWithTimeout(baseName);
    }

    // Protocol requested: try underscore form, then plain form, then base.
    const protoNameUnderscore = constructQueryName(domain, protocol, true);
    const protoNamePlain = constructQueryName(domain, protocol, false);
    const queryNames = [protoNameUnderscore, protoNamePlain, baseName];
    let lastNoRecord: AidError | null = null;

    for (const queryName of queryNames) {
      try {
        return await queryWithTimeout(queryName);
      } catch (error) {
        if (error instanceof AidError && error.errorCode === 'ERR_NO_RECORD') {
          lastNoRecord = error;
          continue;
        }
        throw error;
      }
    }

    throw lastNoRecord ?? new AidError('ERR_NO_RECORD', `No TXT record found for ${baseName}`);
  };

  try {
    return await runDns();
  } catch (error) {
    if (
      wellKnownFallback &&
      error instanceof AidError &&
      (error.errorCode === 'ERR_NO_RECORD' || error.errorCode === 'ERR_DNS_LOOKUP_FAILED')
    ) {
      try {
        const { record, raw, queryName } = await fetchWellKnown(domain, wellKnownTimeoutMs);
        return { record, raw, ttl: DNS_TTL_MIN, queryName };
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
