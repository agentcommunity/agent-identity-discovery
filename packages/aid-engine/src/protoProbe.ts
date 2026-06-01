import { discover, AidError } from '@agentcommunity/aid';
import type { ProbeAttempt } from './types';

export async function runProtocolProbe(
  domain: string,
  protocol: string,
  timeoutMs: number,
): Promise<{ attempt: ProbeAttempt; error?: AidError }> {
  const domainName = `_${protocol}.${domain}`;
  const name = `_agent.${domainName}`;
  try {
    const res = await discover(domainName, {
      timeout: timeoutMs,
      wellKnownFallback: false, // Probes are DNS-only
    });
    return {
      attempt: {
        name,
        type: 'TXT',
        result: 'NOERROR',
        ttl: res.ttl,
        byteLength: new TextEncoder().encode(res.raw).length,
      },
    };
  } catch (e) {
    const error = e as AidError;
    if (error.errorCode === 'ERR_NO_RECORD') {
      return { attempt: { name, type: 'TXT', result: 'NXDOMAIN' }, error };
    }
    return {
      attempt: { name, type: 'TXT', result: 'ERROR', reason: error.errorCode || 'unknown' },
      error,
    };
  }
}
