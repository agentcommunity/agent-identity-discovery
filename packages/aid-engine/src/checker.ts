import { AidError, enforceRedirectPolicy, performPKAHandshake } from '@agentcommunity/aid';
import type { DoctorReport, CheckOptions, ProbeAttempt } from './types';
import { runBaseDiscovery } from './dns';
import { inspectTls } from './tls_inspect';
import { probeDnssecRrsigTxt } from './dnssec';
import { runProtocolProbe } from './protoProbe';
import { ERROR_MESSAGES } from './error_messages';

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
      kid: null,
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
      ...(opts.protocol && { protocol: opts.protocol }),
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
    report.record.raw = (() => {
      // For DNS, we don't receive raw concatenated string from SDK; synthesize minimal
      // to enable byte warnings based on a canonicalized render.
      const parts: string[] = ['v=aid1'];
      if (record.uri) parts.push(`u=${record.uri}`);
      if (record.proto) parts.push(`p=${record.proto}`);
      if (record.auth) parts.push(`a=${record.auth}`);
      if (record.desc) parts.push(`s=${record.desc}`);
      if (record.docs) parts.push(`d=${record.docs}`);
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
      if (record.pka) parts.push(`k=${record.pka}`);
      if (record.kid) parts.push(`i=${record.kid}`);
      return parts.join(';');
    })();

    // Byte length warning
    const byteLen = new TextEncoder().encode(report.record.raw).length;
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

    // PKA presence (handshake can be enabled in future if exported by SDK)
    if (record.pka && record.kid) {
      report.pka.present = true;
      report.pka.kid = record.kid;
      report.pka.alg = 'ed25519'; // Per spec v1.1
      report.pka.attempted = true;
      try {
        await performPKAHandshake(record.uri, record.pka, record.kid);
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

    // Downgrade cache logic
    if (opts.checkDowngrade) {
      report.downgrade.checked = true;
      if (opts.previousCacheEntry) {
        const prev = opts.previousCacheEntry;
        report.downgrade.previous = { pka: prev.pka, kid: prev.kid };
        const nowPka = record.pka ?? null;
        const nowKid = record.kid ?? null;
        if (prev.pka && !nowPka) {
          report.downgrade.status = 'downgrade';
          report.record.warnings.push({
            code: 'DOWNGRADE',
            message: ERROR_MESSAGES.DOWNGRADE_DETECTED,
          });
        } else if (prev.pka && nowPka && prev.pka !== nowPka) {
          report.downgrade.status = 'downgrade';
          report.record.warnings.push({
            code: 'DOWNGRADE',
            message: ERROR_MESSAGES.DOWNGRADE_DETECTED,
          });
        } else if (prev.kid && nowKid && prev.kid !== nowKid) {
          report.downgrade.status = 'downgrade';
          report.record.warnings.push({
            code: 'DOWNGRADE',
            message: ERROR_MESSAGES.DOWNGRADE_DETECTED,
          });
        } else {
          report.downgrade.status = 'no_change';
        }
      } else {
        report.downgrade.status = 'first_seen';
      }
      // Save current
      report.cacheEntry = {
        lastSeen: new Date().toISOString(),
        pka: record.pka ?? null,
        kid: record.kid ?? null,
      };
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
