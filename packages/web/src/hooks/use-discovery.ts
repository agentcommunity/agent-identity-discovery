'use client';

import { useState } from 'react';
// Import the browser-specific discovery function and types
import {
  discover,
  AidError,
  type AidRecord,
  type DiscoveryResult as LibDiscoveryResult,
} from '@agentcommunity/aid/browser';
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
  pka?: { present: boolean; verified: boolean | null; keyid: string | null; domainBound?: boolean };
  tls?: { valid: boolean | null; daysRemaining: number | null };
}

/** The new result type using the generic Result union. */
export type DiscoveryResult = Result<{ record: DiscoveryData; metadata: DiscoveryMetadata }, Error>;

// TEMPORARY backward-compat alias so that legacy imports compile during migration.
// FIXME: remove after all call-sites adopt Result pattern.
export type LegacyDiscoveryResult = DiscoveryResult;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const deriveAid2Keyid = async (pka: string): Promise<string | null> => {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const input = `{"crv":"Ed25519","kty":"OKP","x":"${pka}"}`;
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(input),
    );
    return toBase64Url(new Uint8Array(digest));
  } catch {
    return null;
  }
};

/**
 * Pure function: builds the `pka` metadata object from the parsed AID record and
 * the SDK's handshake result. Exported for unit testing.
 *
 * Coherence rules:
 * - If the DNS record has no `pka` key → `{ present: false, verified: null, keyid: null }`.
 * - If the DNS record has a `pka` key AND `libResult.pka` is set (the SDK only resolves
 *   successfully when the handshake passes, so presence == verified) → `verified: true`.
 * - `domainBound` is forwarded directly from the SDK handshake result.
 * NOTE: keyid is async (requires crypto.subtle) — callers that need the real keyid
 * should compute it separately; here we accept an optional pre-computed value.
 */
export function buildPkaMetadata(
  parsed: AidRecord & { uri?: string },
  libResult: Pick<LibDiscoveryResult, 'pka'>,
  keyid: string | null = null,
): { present: boolean; verified: boolean | null; keyid: string | null; domainBound?: boolean } {
  if (!parsed.pka) {
    return { present: false, verified: null, keyid: null };
  }
  return {
    present: true,
    verified: libResult.pka ? true : null,
    keyid,
    ...(libResult.pka ? { domainBound: libResult.pka.domainBound } : {}),
  };
}

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
      const pkaKeyid = parsed.pka
        ? (parsed.v === 'aid2'
          ? await deriveAid2Keyid(parsed.pka)
          : (parsed.kid ?? null))
        : null;

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
            pka: parsed.pka ? buildPkaMetadata(parsed, libResult, pkaKeyid) : undefined,
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
