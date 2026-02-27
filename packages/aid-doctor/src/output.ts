import chalk from 'chalk';
import type { DoctorReport } from '@agentcommunity/aid-engine';
import { ERROR_MESSAGES } from '@agentcommunity/aid-engine';

function generateActionableSuggestions(report: DoctorReport): string[] {
  const suggestions: string[] = [];
  const { record, dnssec, tls, pka } = report;
  const icon = chalk.blue('💡');

  if (record.raw) {
    const byteLen = new TextEncoder().encode(record.raw).length;
    if (byteLen > 255) {
      suggestions.push(
        `${icon} ${chalk.bold('Reduce record size:')} ${ERROR_MESSAGES.BYTE_LIMIT_EXCEEDED}`,
      );
    }
  }

  if (record.warnings.some((warning) => warning.code === 'LONG_KEY_COMPAT')) {
    suggestions.push(
      `${icon} ${chalk.bold('Canonicalize TXT keys:')} ${ERROR_MESSAGES.USE_ALIASES}`,
    );
  }

  if (!dnssec.present) {
    suggestions.push(`${icon} ${chalk.bold('Enable DNSSEC:')} ${ERROR_MESSAGES.ENABLE_DNSSEC}`);
  }

  if (!pka.present) {
    suggestions.push(`${icon} ${chalk.bold('Add endpoint proof:')} ${ERROR_MESSAGES.ADD_PKA}`);
  }

  if (tls.checked && tls.valid && tls.daysRemaining !== null && tls.daysRemaining < 21) {
    suggestions.push(`${icon} ${chalk.bold('Renew TLS certificate:')} ${ERROR_MESSAGES.RENEW_TLS}`);
  }

  if (record.errors.some((e) => e.code === 'ERR_UNSUPPORTED_PROTO')) {
    suggestions.push(
      `${icon} ${chalk.bold('Check protocol support:')} The protocol in your record is not supported by this client. See the official registry for valid tokens.`,
    );
  }

  return suggestions;
}

export function formatCheckResult(report: DoctorReport): string {
  const { domain, record, queried, tls, dnssec, pka, downgrade } = report;
  const lines: string[] = [];

  const icons = {
    ok: chalk.green('✅'),
    error: chalk.red('❌'),
    warn: chalk.yellow('⚠️'),
    info: chalk.blue('💡'),
  };

  const finalQueryName = queried.attempts[queried.attempts.length - 1]?.name ?? `_agent.${domain}`;

  // 1. DNS
  const dnsAttempt = queried.attempts.find((a) => a.result === 'NOERROR');
  if (dnsAttempt) {
    const ttl = dnsAttempt.ttl ?? 'N/A';
    const bytes = new TextEncoder().encode(record.raw ?? '').length;
    const source = queried.wellKnown.used ? '(.well-known)' : '(DNS)';
    lines.push(
      `[1/6] DNS TXT ${chalk.cyan(finalQueryName)} ... ${icons.ok} Found ${source} (TTL ${ttl}, ${bytes} bytes)`,
    );
  } else {
    lines.push(`[1/6] DNS TXT ${chalk.cyan(finalQueryName)} ... ${icons.error} Not Found`);
  }

  // 2. Record Validation
  if (record.valid) {
    lines.push(`[2/6] Record validation ... ${icons.ok} Valid`);
  } else {
    const msg = record.errors[0]?.message ?? 'Invalid structure';
    lines.push(`[2/6] Record validation ... ${icons.error} ${msg}`);
  }

  // 3. DNSSEC
  if (dnssec.present) {
    lines.push(`[3/6] DNSSEC (RRSIG) ... ${icons.ok} Detected`);
  } else {
    lines.push(`[3/6] DNSSEC (RRSIG) ... ${icons.info} Not detected`);
  }

  // 4. TLS
  if (tls.checked) {
    if (tls.valid) {
      const expiry = tls.daysRemaining;
      lines.push(
        `[4/6] TLS ${chalk.cyan(tls.host ?? '')} ... ${icons.ok} Valid (SAN matches, expires in ${expiry} days)`,
      );
    } else {
      const reason =
        record.errors.find((e) => e.code.startsWith('ERR_SECURITY'))?.message ??
        'TLS validation failed';
      lines.push(`[4/6] TLS ... ${icons.error} ${reason}`);
    }
  } else {
    lines.push(`[4/6] TLS ... ${chalk.gray('Skipped (local protocol)')}`);
  }

  // 5. PKA Handshake
  if (pka.present) {
    if (pka.verified) {
      lines.push(`[5/6] PKA handshake ... ${icons.ok} Verified (alg=${pka.alg}, kid=${pka.kid})`);
    } else {
      const reason =
        record.errors.find((e) => e.message.includes('PKA'))?.message ?? 'Verification failed';
      lines.push(`[5/6] PKA handshake ... ${icons.error} ${reason}`);
    }
  } else {
    lines.push(`[5/6] PKA handshake ... ${icons.info} Not present`);
  }

  // 6. Downgrade Check
  if (downgrade.checked) {
    if (downgrade.status === 'downgrade') {
      lines.push(`[6/6] Downgrade check ... ${icons.warn} Security downgrade detected`);
    } else {
      lines.push(`[6/6] Downgrade check ... ${icons.ok} No change`);
    }
  } else {
    lines.push(`[6/6] Downgrade check ... ${chalk.gray('Skipped')}`);
  }

  lines.push('\n--- Summary ---');
  if (report.exitCode === 0) {
    const warnings = record.warnings.filter((w) => w.code !== 'PROTOCOL_SUBDOMAIN_EXISTS');
    if (warnings.length > 0) {
      lines.push(`${icons.warn} Record is valid but has ${warnings.length} warning(s).`);
      for (const warn of warnings) {
        lines.push(`  - ${warn.message}`);
      }
    } else {
      lines.push(`${icons.ok} Record is valid and secure.`);
    }
  } else {
    lines.push(
      `${icons.error} Found ${report.record.errors.length} error(s) and ${record.warnings.length} warning(s).`,
    );
  }

  const suggestions = generateActionableSuggestions(report);
  if (suggestions.length > 0) {
    lines.push('\n--- Recommendations ---');
    lines.push(...suggestions);
  }

  return lines.join('\n');
}
