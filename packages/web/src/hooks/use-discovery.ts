'use client';

import { useState } from 'react';
// Import the browser-specific discovery function and types
import { discover, AidError, type AidRecord } from '@agentcommunity/aid/browser';
import type { Result } from '@/lib/types/result';

/** Shape of the successful TXT payload parsed and formatted by the hook for the UI. */
export type DiscoveryData = AidRecord & {
  host: string;
  port: number;
  /** The connection protocol (e.g., mcp, custom). */
  protocol?: string;
  /** Optional extra fields that may be present in TXT record (e.g., protocol). */
  [key: string]: unknown;
};

/**
 * Represents additional metadata we want to expose alongside a successful discovery.
 * We keep it separate from DiscoveryData so consumers can choose whether they need
 * the parsed record or the diagnostic details.
 */
export interface DiscoveryMetadata {
  dnsQuery: string;
  lookupTime: number;
  recordType: 'TXT';
  source: 'DNS-over-HTTPS' | 'DNS';
  txtRecord?: string;
  dnssecPresent?: boolean;
  pka?: { present: boolean; verified: boolean | null; kid: string | null };
  tls?: { valid: boolean | null; daysRemaining: number | null };
}

/** The new result type using the generic Result union. */
export type DiscoveryResult = Result<{ record: DiscoveryData; metadata: DiscoveryMetadata }, Error>;

// TEMPORARY backward-compat alias so that legacy imports compile during migration.
// FIXME: remove after all call-sites adopt Result pattern.
export type LegacyDiscoveryResult = DiscoveryResult;

/**
 * React hook for performing client-side AID DNS discovery.
 */
export function useDiscovery() {
  const [status, setStatus] = useState<'pending' | 'running' | 'success' | 'error'>('pending');
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  const execute = async (domain: string): Promise<DiscoveryResult> => {
    setStatus('running');

    const startTime = Date.now();
    try {
      // Browser-safe discovery
      const libResult = await discover(domain);
      const lookupTime = Date.now() - startTime;

      const parsed = libResult.record as unknown as AidRecord & { uri: string };
      const resultUri = new URL(parsed.uri);
      const reconstructedTxt = Object.entries(libResult.record)
        .map(([k, v]) => `${k}=${v as string}`)
        .join(';');

      // Format the successful result into the shape our UI expects
      const successResult: DiscoveryResult = {
        ok: true,
        value: {
          record: {
            ...parsed,
            host: resultUri.hostname,
            port: resultUri.port ? Number.parseInt(resultUri.port, 10) : 443,
          },
          metadata: {
            dnsQuery: libResult.queryName,
            lookupTime,
            recordType: 'TXT',
            source: 'DNS-over-HTTPS',
            txtRecord: reconstructedTxt,
            pka: parsed.pka
              ? {
                  present: true,
                  verified: null,
                  kid: parsed.v === 'aid1' ? (parsed.kid ?? null) : null,
                }
              : undefined,
          },
        },
      };

      setResult(successResult);
      setStatus('success');
      return successResult;
    } catch (error) {
      const err: Error =
        error instanceof AidError
          ? error
          : (error instanceof Error
            ? error
            : new Error('Unknown discovery error'));

      const errorResult: DiscoveryResult = {
        ok: false,
        error: err,
      };

      setResult(errorResult);
      setStatus('error');
      return errorResult;
    }
  };

  return { status, result, execute } as const;
}
