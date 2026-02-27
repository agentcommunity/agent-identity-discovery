/**
 * @agentcommunity/aid/browser - Browser-compatible Agent Identity & Discovery
 *
 * This module provides AID functionality for browser environments using DNS-over-HTTPS.
 *
 * @example
 * ```typescript
 * import { discover, parse } from '@agentcommunity/aid/browser';
 *
 * // Discover an agent by domain (uses DoH)
 * const result = await discover('example.com');
 * console.log(result.record.uri); // https://api.example.com/mcp
 * ```
 */

import { type AidRecord, DNS_SUBDOMAIN } from './constants.js';
import { AidError, parse, canonicalizeRaw, AidRecordValidator } from './parser.js';
import { performPKAHandshake } from './pka.js';

/**
 * DNS-over-HTTPS query result from Cloudflare
 */
interface DoHResponse {
  Status: number;
  TC: boolean;
  RD: boolean;
  RA: boolean;
  AD: boolean;
  CD: boolean;
  Question: Array<{
    name: string;
    type: number;
  }>;
  Answer?: Array<{
    name: string;
    type: number;
    TTL: number;
    data: string;
  }>;
}

/**
 * Browser-compatible DNS discovery result
 */
export interface DiscoveryResult {
  /** The discovered AID record */
  record: AidRecord;
  /** The domain that was queried */
  domain: string;
  /** The full DNS name that was queried */
  queryName: string;
  /** TTL of the DNS record in seconds */
  ttl?: number;
}

/**
 * Options for browser-based DNS discovery
 */
export interface DiscoveryOptions {
  /** Timeout for DNS queries in milliseconds (default: 5000) */
  timeout?: number;
  /** Protocol-specific subdomain to try first (e.g., 'mcp' for _agent._mcp.domain.com) */
  protocol?: string;
  /** Custom DNS-over-HTTPS provider URL (default: Cloudflare) */
  dohProvider?: string;
  /** Enable .well-known fallback on ERR_NO_RECORD (default: true) */
  wellKnownFallback?: boolean;
  /** Timeout for .well-known fetch in milliseconds (default: 2000) */
  wellKnownTimeoutMs?: number;
}

/**
 * Normalize a domain name to its A-label representation (Punycode)
 *
 * @param domain - The domain name to normalize
 * @returns The normalized domain name
 */
function normalizeDomain(domain: string): string {
  try {
    // Use URL constructor to handle IDN conversion
    const url = new URL(`https://${domain}`);
    return url.hostname;
  } catch {
    // If URL parsing fails, return as-is (may be invalid)
    return domain;
  }
}

/**
 * Construct the DNS query name for AID discovery
 *
 * @param domain - The base domain
 * @param protocol - Optional protocol-specific subdomain
 * @param useUnderscore - Use underscore prefix for protocol (e.g., _mcp)
 * @returns The DNS query name
 */
function constructQueryName(domain: string, protocol?: string, useUnderscore = false): string {
  const normalizedDomain = normalizeDomain(domain);

  if (protocol) {
    const protoPart = useUnderscore ? `_${protocol}` : protocol;
    return `${DNS_SUBDOMAIN}.${protoPart}.${normalizedDomain}`;
  }

  return `${DNS_SUBDOMAIN}.${normalizedDomain}`;
}

function looksLikeAidRecord(raw: string): boolean {
  return /(?:^|;)\s*(?:v|version)\s*=\s*aid1(?:\s*(?:;|$))/i.test(raw);
}

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
  const url = `https://${domain}/.well-known/agent`;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'error',
    });
    if (!res.ok) {
      throw new AidError('ERR_FALLBACK_FAILED', `Well-known HTTP ${res.status}`);
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('application/json')) {
      throw new AidError(
        'ERR_FALLBACK_FAILED',
        'Invalid content-type for well-known (expected application/json)',
      );
    }
    const text = await res.text();
    if (text.length > 64 * 1024) {
      throw new AidError('ERR_FALLBACK_FAILED', 'Well-known response too large (>64KB)');
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AidError('ERR_FALLBACK_FAILED', 'Invalid JSON in well-known response');
    }
    if (typeof json !== 'object' || json === null) {
      throw new AidError('ERR_FALLBACK_FAILED', 'Well-known JSON must be an object');
    }
    const raw = canonicalizeRaw(json as Record<string, unknown>);
    const record = AidRecordValidator.validate(raw);
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
      throw e;
    }
    throw new AidError('ERR_FALLBACK_FAILED', e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Query DNS for TXT records using DNS-over-HTTPS
 *
 * @param queryName - The DNS name to query
 * @param options - Discovery options
 * @returns Array of TXT record strings with TTL information
 */
async function queryTxtRecordsDoH(
  queryName: string,
  options: DiscoveryOptions = {},
): Promise<Array<{ data: string; ttl: number }>> {
  const { timeout = 5000, dohProvider = 'https://cloudflare-dns.com/dns-query' } = options;

  const url = new URL(dohProvider);
  url.searchParams.set('name', queryName);
  url.searchParams.set('type', 'TXT');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/dns-json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new AidError(
        'ERR_SECURITY',
        `DoH query failed: ${response.status} ${response.statusText}`,
      );
    }

    const dnsResult: DoHResponse = await response.json();

    // Check for DNS query errors
    if (dnsResult.Status !== 0) {
      throw new AidError('ERR_NO_RECORD', `No _agent TXT record found for ${queryName}`);
    }

    // Extract TXT records from the response
    const txtRecords = (dnsResult.Answer || [])
      .filter((answer) => answer.type === 16) // TXT record type
      .map((answer) => ({
        data: answer.data.replaceAll('"', ''), // Remove surrounding quotes
        ttl: answer.TTL,
      }));

    if (txtRecords.length === 0) {
      throw new AidError('ERR_NO_RECORD', `No _agent TXT record found for ${queryName}`);
    }

    return txtRecords;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof AidError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new AidError('ERR_SECURITY', `DNS query timeout for ${queryName}`);
      }

      throw new AidError('ERR_SECURITY', `DNS query failed for ${queryName}: ${error.message}`);
    }

    throw new AidError('ERR_SECURITY', `DNS query failed for ${queryName}: ${error}`);
  }
}

/**
 * Discover an agent using the AID protocol in browser environments
 *
 * @param domain - The domain to discover
 * @param options - Discovery options
 * @returns Promise resolving to the discovery result
 * @throws AidError if discovery fails
 */
export async function discover(
  domain: string,
  options: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  const { protocol, wellKnownFallback = true, wellKnownTimeoutMs = 2000 } = options;

  const tryQuery = async (name: string): Promise<DiscoveryResult> => {
    const txtRecords = await queryTxtRecordsDoH(name, options);
    const validRecords: DiscoveryResult[] = [];
    let lastAidError: AidError | null = null;

    for (const txtRecord of txtRecords) {
      const recordString = txtRecord.data.trim();
      if (!looksLikeAidRecord(recordString)) continue;

      try {
        const record = parse(recordString);
        if (record.dep) {
          const depDate = new Date(record.dep);
          if (!Number.isNaN(depDate.getTime())) {
            if (depDate.getTime() < Date.now()) {
              throw new AidError(
                'ERR_INVALID_TXT',
                `Record for ${name} was deprecated on ${record.dep}`,
              );
            }
            console.warn(
              `[AID] WARNING: Record for ${name} is scheduled for deprecation on ${record.dep}`,
            );
          }
        }
        validRecords.push({
          record,
          domain,
          queryName: name,
          ttl: txtRecord.ttl,
        });
      } catch (err) {
        if (err instanceof AidError) {
          lastAidError = err;
          continue;
        }
        throw err;
      }
    }

    if (validRecords.length === 1) {
      const result = validRecords[0];
      if (result.record.pka) {
        await performPKAHandshake(result.record.uri, result.record.pka, result.record.kid ?? '');
      }
      return result;
    }

    if (validRecords.length > 1) {
      throw new AidError(
        'ERR_INVALID_TXT',
        `Multiple valid AID records found for ${name}; publish exactly one valid record per queried DNS name`,
      );
    }

    if (lastAidError) throw lastAidError;

    throw new AidError('ERR_NO_RECORD', `No valid AID record found for ${name}`);
  };

  const runDns = async (): Promise<DiscoveryResult> => {
    // If protocol is explicitly requested, try that first, then fall back to base
    if (protocol) {
      const underscoreName = constructQueryName(domain, protocol, true);
      try {
        return await tryQuery(underscoreName);
      } catch (error) {
        if (!(error instanceof AidError) || error.errorCode !== 'ERR_NO_RECORD') {
          throw error;
        }
        // Fall through to base query
      }
    }
    // Base query
    return tryQuery(constructQueryName(domain));
  };

  try {
    return await runDns();
  } catch (error) {
    if (
      wellKnownFallback &&
      error instanceof AidError &&
      (error.errorCode === 'ERR_NO_RECORD' || error.errorCode === 'ERR_SECURITY') // ERR_SECURITY can be a timeout
    ) {
      try {
        const { record, queryName } = await fetchWellKnown(domain, wellKnownTimeoutMs);
        // well-known does not provide a TTL, so we use a sensible default.
        return { record, domain, queryName, ttl: 300 };
      } catch {
        // Throw original error if fallback fails to provide better context
        throw error;
      }
    }
    throw error;
  }
}

/**
 * Discover multiple agents from a list of domains
 *
 * @param domains - Array of domains to discover
 * @param options - Discovery options
 * @returns Promise resolving to array of discovery results
 */
export async function discoverMultiple(
  domains: string[],
  options: DiscoveryOptions = {},
): Promise<DiscoveryResult[]> {
  const results = await Promise.allSettled(domains.map((domain) => discover(domain, options)));

  const successful: DiscoveryResult[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      successful.push(result.value);
    }
  }

  return successful;
}

/**
 * Test if a domain has an AID record without parsing it
 *
 * @param domain - The domain to test
 * @param options - Discovery options
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

// Re-export parser functions and constants that work in both environments
export {
  AidError,
  parse,
  parseRawRecord,
  validateRecord,
  isValidProto,
  AidRecordValidator,
  canonicalizeRaw,
} from './parser.js';

// Re-export all constants and types for easy access
export * from './constants.js';

// Default export for convenience
export default discover;
