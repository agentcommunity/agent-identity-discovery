import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { AidError, enforceRedirectPolicy, performPKAHandshake } from '@agentcommunity/aid';
import type { CacheEntry, DoctorReport, CheckOptions, ProbeAttempt } from './types';
import { runBaseDiscovery } from './dns';
import { inspectTls } from './tls_inspect';
import { probeDnssecRrsigTxt } from './dnssec';
import { runProtocolProbe } from './protoProbe';
import { ERROR_MESSAGES } from './error_messages';
import { findLongKeyNames } from './generator';

/**
 * Normalize a discovery domain to its bare host for the AID-Domain binding
 * header (strips any port / scheme), mirroring the client SDK's normalizeDomain.
 */
function normalizeDomainHost(domain: string): string {
  try {
    return new URL(`http://${domain}`).hostname;
  } catch {
    return domain;
  }
}

// --- PKA key identity helpers (mirrors aid-doctor/src/cache.ts) ---

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodeBase58(value: string): Uint8Array | null {
  let leadingZeros = 0;
  for (const char of value) {
    if (char !== '1') break;
    leadingZeros += 1;
  }
  if (leadingZeros === value.length) {
    return new Uint8Array(leadingZeros);
  }

  const bytes = [0];
  for (const char of value.slice(leadingZeros)) {
    const valueIndex = BASE58_ALPHABET.indexOf(char);
    if (valueIndex === -1) return null;
    let carry = valueIndex;
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  const decoded = bytes.reverse();
  return new Uint8Array([...new Array<number>(leadingZeros).fill(0), ...decoded]);
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.includes('=') || value.length % 4 === 1) {
    return null;
  }
  try {
    return new Uint8Array(Buffer.from(value, 'base64url'));
  } catch {
    return null;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64url');
}

/**
 * Derive an Ed25519 RFC 7638 JWK thumbprint (keyid) and the canonical base64url
 * JWK `x` value from either an aid1 legacy `z`-prefixed base58btc key or an aid2
 * base64url JWK `x` key.
 */
function derivePkaKeyid(pka: string | null | undefined): { keyid: string; jwkX: string } | null {
  if (!pka) return null;
  const publicKey = pka.startsWith('z') ? decodeBase58(pka.slice(1)) : decodeBase64Url(pka);
  if (!publicKey || publicKey.length !== 32) return null;

  const jwkX = toBase64Url(publicKey);
  const thumbprintInput = `{"crv":"Ed25519","kty":"OKP","x":"${jwkX}"}`;
  return {
    jwkX,
    keyid: createHash('sha256').update(thumbprintInput).digest('base64url'),
  };
}

type SecurityChangeStatus =
  | 'first_seen'
  | 'no_change'
  | 'pka_added'
  | 'pka_removed'
  | 'key_replaced'
  | 'version_downgrade'
  | 'binding_loss'
  | 'fallback_well_known_tls';

/**
 * Classify the security-state transition between a previously cached entry and
 * the current discovery. Mirrors aid-doctor/src/cache.ts classifySecurityChange.
 */
function classifySecurityChange(
  previous: CacheEntry | null | undefined,
  current: CacheEntry,
): SecurityChangeStatus {
  if (current.trustSource === 'well-known-tls') {
    return 'fallback_well_known_tls';
  }

  if (!previous) return 'first_seen';

  if (previous.version === 'aid2' && current.version === 'aid1') {
    return 'version_downgrade';
  }

  const previousHasPka = Boolean(previous.pka || previous.keyid);
  const currentHasPka = Boolean(current.pka || current.keyid);
  if (!previousHasPka && currentHasPka) return 'pka_added';
  if (previousHasPka && !currentHasPka) return 'pka_removed';

  const previousKey = previous.keyid ?? derivePkaKeyid(previous.pka)?.keyid ?? previous.pka;
  const currentKey = current.keyid ?? derivePkaKeyid(current.pka)?.keyid ?? current.pka;
  if (previousKey && currentKey && previousKey !== currentKey) {
    return 'key_replaced';
  }

  // Binding loss is warning-only. Keep it AFTER the fail-eligible branches above so
  // it can never mask a higher-severity downgrade (key replacement, version drop,
  // pka removal) — otherwise it would open a downgrade-evasion path.
  if (previous.domainBound === true && current.domainBound === false) {
    return 'binding_loss';
  }

  return 'no_change';
}

function initReport(domain: string, protocol?: string): DoctorReport {
  return {
    domain,
    queried: {
      strategy: 'base-first',
      hint: { proto: protocol, source: 'cli', present: Boolean(protocol) },
      attempts: [],
      wellKnown: {
        attempted: false,
        used: false,
        url: null,
        httpStatus: null,
        contentType: null,
        byteLength: null,
        status: null,
        snippet: null,
      },
    },
    record: { raw: null, parsed: null, valid: false, warnings: [], errors: [] },
    dnssec: { present: false, method: 'RRSIG', proof: null },
    tls: {
      checked: false,
      valid: null,
      host: null,
      sni: null,
      issuer: null,
      san: null,
      validFrom: null,
      validTo: null,
      daysRemaining: null,
      redirectBlocked: null,
    },
    pka: {
      present: false,
      attempted: false,
      verified: null,
      domainBound: null,
      kid: null,
      keyid: null,
      alg: null,
      createdSkewSec: null,
      covered: null,
    },
    downgrade: { checked: false, previous: null, status: null },
    exitCode: 1,
    cacheEntry: null,
  };
}

export async function runCheck(domain: string, opts: CheckOptions): Promise<DoctorReport> {
  const report = initReport(domain, opts.protocol);

  try {
    const dnsRes = await runBaseDiscovery(domain, {
      // Base-first for diagnostics: the protocol hint never steers base discovery
      // toward a protocol-specific subdomain. Explicit proto probes below remain
      // diagnostics-only.
      timeoutMs: opts.timeoutMs,
      allowFallback: opts.allowFallback,
      wellKnownTimeoutMs: opts.wellKnownTimeoutMs,
      ...(opts.securityMode ? { securityMode: opts.securityMode } : {}),
      ...(opts.dnssecPolicy ? { dnssecPolicy: opts.dnssecPolicy } : {}),
      ...(opts.pkaPolicy ? { pkaPolicy: opts.pkaPolicy } : {}),
      ...(opts.downgradePolicy ? { downgradePolicy: opts.downgradePolicy } : {}),
      ...(opts.wellKnownPolicy ? { wellKnownPolicy: opts.wellKnownPolicy } : {}),
      ...(opts.previousSecurity ? { previousSecurity: opts.previousSecurity } : {}),
    });
    // This is the success path now
    if (!dnsRes.ok) {
      throw dnsRes.error!;
    }
    const value = dnsRes.value!;
    const queryName = value.queryName;
    const attempt: ProbeAttempt = {
      name: queryName,
      type: 'TXT',
      result: 'NOERROR',
      ttl: value.ttl,
    };
    report.queried.attempts.push(attempt);
    if (value.queryName.startsWith('https')) {
      report.queried.wellKnown.used = true;
      report.queried.wellKnown.attempted = true;
      report.queried.wellKnown.url = value.queryName;
    }

    // Optional: probe proto subdomain even if base exists (for drift detection)
    if (opts.protocol && opts.probeProtoEvenIfBase) {
      const probeRes = await runProtocolProbe(domain, opts.protocol, opts.timeoutMs);
      report.queried.attempts.push(probeRes.attempt);
      if (!probeRes.error) {
        report.record.warnings.push({
          code: 'PROTOCOL_SUBDOMAIN_EXISTS',
          message: `A record exists at the protocol-specific subdomain _agent._${opts.protocol}.${domain}, which may differ from the base record.`,
        });
      }
    }

    // Fill record
    const record = value.record;
    report.record.parsed = record;
    report.record.valid = true;
    for (const warning of value.security.warnings) {
      report.record.warnings.push({
        code: warning.code,
        message: warning.message,
      });
    }
    report.record.raw = value.raw;
    if (!value.queryName.startsWith('https')) {
      const longKeys = findLongKeyNames(value.raw);
      if (longKeys.length > 0) {
        report.record.warnings.push({
          code: 'LONG_KEY_COMPAT',
          message: `${ERROR_MESSAGES.LONG_KEY_COMPAT} Found: ${longKeys.join(', ')}.`,
        });
      }
    }
    if (record.dep) {
      const depDate = new Date(record.dep);
      if (depDate.getTime() < Date.now()) {
        report.record.errors.push({
          code: 'DEPRECATED',
          message: ERROR_MESSAGES.DEPRECATED_RECORD,
        });
        report.record.valid = false;
        report.exitCode = 1001; // ERR_INVALID_TXT
      } else {
        report.record.warnings.push({
          code: 'DEPRECATION_SCHEDULED',
          message: `Record is scheduled for deprecation on ${record.dep}`,
        });
      }
    }

    // Byte length warning
    const byteLen = new TextEncoder().encode(report.record.raw ?? '').length;
    if (byteLen > 255) {
      report.record.warnings.push({
        code: 'BYTE_LIMIT',
        message: ERROR_MESSAGES.BYTE_LIMIT_EXCEEDED,
      });
    }

    // TLS redirect policy (minimal for M1; full TLS module to be added M2)
    const skipSecurity =
      typeof process !== 'undefined' && process.env && process.env.AID_SKIP_SECURITY === '1';
    if (!skipSecurity && record.proto !== 'local' && record.proto !== 'zeroconf') {
      try {
        await enforceRedirectPolicy(record.uri, opts.timeoutMs);
        // Only perform TLS inspection for HTTPS URLs
        if (record.uri.startsWith('https://')) {
          const tlsInfo = await inspectTls(record.uri, opts.timeoutMs);
          report.tls.checked = true;
          report.tls.valid = true;
          report.tls.host = tlsInfo.host;
          report.tls.sni = tlsInfo.sni;
          report.tls.issuer = tlsInfo.issuer;
          report.tls.san = tlsInfo.san;
          report.tls.validFrom = tlsInfo.validFrom;
          report.tls.validTo = tlsInfo.validTo;
          report.tls.daysRemaining = tlsInfo.daysRemaining;
          if (tlsInfo.daysRemaining !== null && tlsInfo.daysRemaining < 21) {
            report.record.warnings.push({
              code: 'TLS_EXPIRING',
              message: ERROR_MESSAGES.TLS_EXPIRING_SOON,
            });
          }
        } else {
          // Skip TLS for HTTP URLs
          report.tls.checked = false;
          report.tls.valid = null;
        }
      } catch (e) {
        const err = e as AidError;
        report.tls.checked = true;
        report.tls.valid = false;
        report.record.errors.push({ code: err.errorCode ?? 'ERR_SECURITY', message: err.message });
        report.exitCode = err instanceof AidError ? err.code : 1003;
        return report;
      }
    }

    // DNSSEC presence probe (best-effort)
    try {
      const r = await probeDnssecRrsigTxt(value.queryName);
      report.dnssec.present = r.present;
      report.dnssec.proof = r.proof;
    } catch {
      // ignore
    }

    if (record.pka) {
      const keyMaterial = derivePkaKeyid(record.pka);
      report.pka.present = true;
      report.pka.kid = record.v === 'aid1' ? (record.kid ?? null) : null;
      report.pka.keyid = keyMaterial?.keyid ?? null;
      report.pka.alg = 'ed25519';
      report.pka.attempted = true;
      try {
        if (record.v === 'aid1') {
          await performPKAHandshake(record.uri, record.pka, record.kid ?? '');
          report.pka.domainBound = false; // v1 never domain-binds
        } else {
          // Sends AID-Domain so the endpoint can prove/refuse the binding; the domainBound
          // result is captured in the doctor report.
          const pkaResult = await performPKAHandshake(
            record.uri,
            record.pka,
            undefined,
            normalizeDomainHost(domain),
          );
          report.pka.domainBound = pkaResult.domainBound;
        }
        report.pka.verified = true;
      } catch (e) {
        const err = e as AidError;
        report.pka.verified = false;
        report.record.errors.push({
          code: err.errorCode ?? 'ERR_SECURITY',
          message: ERROR_MESSAGES.PKA_HANDSHAKE_FAILED,
        });
        report.exitCode = err instanceof AidError ? err.code : 1003;
        return report;
      }
    }

    // Downgrade cache logic (security-state semantics, mirrors aid-doctor cache.ts)
    if (opts.checkDowngrade) {
      report.downgrade.checked = true;

      const trustSource: 'dns' | 'well-known-tls' = report.queried.wellKnown.used
        ? 'well-known-tls'
        : 'dns';
      const keyMaterial = derivePkaKeyid(record.pka ?? null);
      const currentEntry: CacheEntry = {
        lastSeen: new Date().toISOString(),
        version: record.v ?? null,
        trustSource,
        pka: record.pka ?? null,
        kid: record.v === 'aid1' ? (record.kid ?? null) : null,
        keyid: keyMaterial?.keyid ?? null,
        jwkX: keyMaterial?.jwkX ?? null,
        domainBound: report.pka.domainBound ?? null,
        hash: null,
      };

      const prev = opts.previousCacheEntry ?? null;
      if (prev) {
        report.downgrade.previous = {
          pka: prev.pka,
          kid: prev.kid,
          keyid: prev.keyid ?? null,
          version: prev.version ?? null,
          trustSource: prev.trustSource ?? null,
        };
      }

      const status = classifySecurityChange(prev, currentEntry);
      report.downgrade.status = status;

      switch (status) {
        case 'pka_removed':
          report.record.warnings.push({
            code: 'PKA_REMOVED',
            message: ERROR_MESSAGES.DOWNGRADE_DETECTED,
          });
          break;
        case 'key_replaced':
          report.record.warnings.push({
            code: 'KEY_REPLACED',
            message: ERROR_MESSAGES.KEY_ROTATION_DETECTED,
          });
          break;
        case 'version_downgrade':
          report.record.warnings.push({
            code: 'VERSION_DOWNGRADE',
            message:
              'Security downgrade detected: a previously seen aid2 record is now served as aid1.',
          });
          break;
        case 'fallback_well_known_tls':
          report.record.warnings.push({
            code: 'FALLBACK_WELL_KNOWN_TLS',
            message:
              'Trust is established via TLS-hosted well-known metadata rather than the DNS record.',
          });
          break;
        case 'pka_added':
          report.record.warnings.push({
            code: 'PKA_ADDED',
            message: 'Endpoint proof (PKA) is now present where it was previously absent.',
          });
          break;
        case 'binding_loss':
          report.record.warnings.push({
            code: 'BINDING_LOSS',
            message:
              'Domain-binding proof was present in the previous check but is now absent (endpoint-proof only).',
          });
          break;
        default:
          break;
      }

      // Save current
      report.cacheEntry = currentEntry;
    }

    report.exitCode = 0;
    return report;
  } catch (e) {
    const err = e as AidError;
    report.exitCode = err instanceof AidError ? err.code : 1000;
    report.record.errors.push({ code: err.errorCode ?? 'ERR_NO_RECORD', message: err.message });

    // Populate well-known details on fallback failure
    if (err.errorCode === 'ERR_FALLBACK_FAILED' && err.details) {
      report.queried.wellKnown.attempted = true;
      report.queried.wellKnown.httpStatus = err.details.httpStatus as number | null;
      report.queried.wellKnown.contentType = err.details.contentType as string | null;
      report.queried.wellKnown.snippet = err.details.snippet as string | null;
      report.queried.wellKnown.byteLength = err.details.byteLength as number | null;
    }

    // Optional: run a protocol-specific probe for diagnostics if base failed
    if (opts.protocol && opts.probeProtoSubdomain) {
      const probeRes = await runProtocolProbe(domain, opts.protocol, opts.timeoutMs);
      report.queried.attempts.push(probeRes.attempt);
    }

    return report;
  }
}
