import { runCheck } from '@agentcommunity/aid-engine';
import { isPrivateHost } from './ssrf';

export const getSecurityInfo = async (
  hostname: string,
): Promise<Record<string, unknown> | undefined> => {
  try {
    if (isPrivateHost(hostname)) {
      return undefined;
    }

    const report = await runCheck(hostname, {
      timeoutMs: 4000,
      allowFallback: true,
      wellKnownTimeoutMs: 1500,
      showDetails: true,
    });

    return {
      dnssec: report.dnssec.present,
      pka: {
        present: report.pka.present,
        attempted: report.pka.attempted,
        verified: report.pka.verified,
        keyid: report.pka.keyid,
        alg: report.pka.alg,
        domainBound: report.pka.domainBound ?? undefined,
      },
      tls: report.tls,
      warnings: report.record.warnings,
      errors: report.record.errors,
    };
  } catch {
    return undefined;
  }
};
