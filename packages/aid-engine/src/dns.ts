import { discover, AidError } from '@agentcommunity/aid';
import type { ProbeAttempt } from './types';

export interface DnsQueryResult<T> {
  ok: boolean;
  value?: T;
  error?: AidError;
}

export interface BaseDiscovery {
  queryName: string;
  raw: string;
  ttl: number;
}

export async function runBaseDiscovery(
  domain: string,
  options: {
    protocol?: string;
    timeoutMs: number;
    allowFallback: boolean;
    wellKnownTimeoutMs: number;
    securityMode?: import('@agentcommunity/aid').SecurityMode;
    dnssecPolicy?: import('@agentcommunity/aid').DnssecPolicy;
    pkaPolicy?: import('@agentcommunity/aid').PkaPolicy;
    downgradePolicy?: import('@agentcommunity/aid').DowngradePolicy;
    wellKnownPolicy?: import('@agentcommunity/aid').WellKnownPolicy;
    previousSecurity?: import('@agentcommunity/aid').PreviousSecurityState;
  },
): Promise<
  DnsQueryResult<{
    record: import('@agentcommunity/aid').AidRecord;
    raw: string;
    queryName: string;
    ttl?: number;
    security: import('@agentcommunity/aid').DiscoverySecurity;
  }>
> {
  try {
    const res = await discover(domain, {
      ...(options.protocol ? { protocol: options.protocol } : {}),
      timeout: options.timeoutMs,
      wellKnownFallback: options.allowFallback,
      wellKnownTimeoutMs: options.wellKnownTimeoutMs,
      ...(options.securityMode ? { securityMode: options.securityMode } : {}),
      ...(options.dnssecPolicy ? { dnssecPolicy: options.dnssecPolicy } : {}),
      ...(options.pkaPolicy ? { pkaPolicy: options.pkaPolicy } : {}),
      ...(options.downgradePolicy ? { downgradePolicy: options.downgradePolicy } : {}),
      ...(options.wellKnownPolicy ? { wellKnownPolicy: options.wellKnownPolicy } : {}),
      ...(options.previousSecurity ? { previousSecurity: options.previousSecurity } : {}),
    });
    return { ok: true, value: res };
  } catch (e) {
    return { ok: false, error: e as AidError };
  }
}

export function computeTxtByteLength(raw: string): number {
  return new TextEncoder().encode(raw).length;
}

export function attemptFromDnsResult(
  name: string,
  result: { ok: boolean; value?: { ttl?: number; record: { v: string } }; error?: AidError },
): ProbeAttempt {
  if (result.ok) {
    return {
      name,
      type: 'TXT',
      result: 'NOERROR',
      ttl: result.value?.ttl,
    };
  }
  const err = result.error;
  if (err && err.errorCode === 'ERR_NO_RECORD') {
    return { name, type: 'TXT', result: 'NXDOMAIN' };
  }
  if (err && err.errorCode === 'ERR_DNS_LOOKUP_FAILED') {
    return { name, type: 'TXT', result: 'ERROR', reason: 'network' };
  }
  return { name, type: 'TXT', result: 'ERROR', reason: err?.errorCode || 'unknown' };
}
