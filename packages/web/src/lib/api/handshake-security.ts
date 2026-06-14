import { runCheck } from '@agentcommunity/aid-engine';

const isPrivateHost = (host: string): boolean =>
  host === 'localhost' ||
  host === '127.0.0.1' ||
  /^10\./.test(host) ||
  /^192\.168\./.test(host) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

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
        createdSkewSec: report.pka.createdSkewSec,
        covered: report.pka.covered,
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
