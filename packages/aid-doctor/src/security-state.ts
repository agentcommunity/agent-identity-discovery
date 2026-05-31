import type { DoctorReport } from '@agentcommunity/aid-engine';
import {
  buildCacheEntryFromReport,
  classifySecurityChange,
  type CacheEntry,
  type SecurityChangeStatus,
} from './cache';

type DowngradePolicy = 'off' | 'warn' | 'fail';

const FAIL_POLICY_STATUSES = new Set<SecurityChangeStatus>([
  'pka_removed',
  'key_replaced',
  'version_downgrade',
]);

interface ApplySecurityStateResult {
  shouldPersist: boolean;
}

function shouldRejectForFailPolicy(
  status: SecurityChangeStatus,
  previousCacheEntry: CacheEntry | undefined,
): boolean {
  if (FAIL_POLICY_STATUSES.has(status)) return true;
  if (status !== 'fallback_well_known_tls') return false;

  return Boolean(previousCacheEntry && (previousCacheEntry.trustSource ?? 'dns') === 'dns');
}

export function applySecurityState(
  report: DoctorReport,
  previousCacheEntry: CacheEntry | undefined,
  downgradePolicy?: DowngradePolicy,
): ApplySecurityStateResult {
  if (!report.record.parsed) return { shouldPersist: false };

  const currentEntry = buildCacheEntryFromReport(report);
  const status = classifySecurityChange(previousCacheEntry, currentEntry);
  report.downgrade.checked = true;
  report.downgrade.previous = previousCacheEntry
    ? {
        pka: previousCacheEntry.pka,
        kid: previousCacheEntry.kid,
        keyid: previousCacheEntry.keyid ?? null,
        version: previousCacheEntry.version ?? null,
        trustSource: previousCacheEntry.trustSource ?? 'dns',
      }
    : null;
  report.downgrade.status = status;

  const warningByStatus: Partial<Record<SecurityChangeStatus, { code: string; message: string }>> =
    {
      pka_removed: {
        code: 'PKA_REMOVED',
        message: 'Previously present PKA was removed.',
      },
      key_replaced: {
        code: 'KEY_REPLACED',
        message: 'Previously observed PKA key was replaced.',
      },
      version_downgrade: {
        code: 'VERSION_DOWNGRADE',
        message: 'Previously observed aid2 record is now aid1.',
      },
      fallback_well_known_tls: {
        code: 'FALLBACK_WELL_KNOWN_TLS',
        message: 'DNS failed and .well-known supplied TLS-hosted metadata.',
      },
      pka_added: {
        code: 'PKA_ADDED',
        message: 'PKA endpoint proof was added since the previous check.',
      },
    };
  const warning = warningByStatus[status];
  if (warning) {
    report.record.warnings.push(warning);
  }

  if (downgradePolicy === 'fail' && shouldRejectForFailPolicy(status, previousCacheEntry)) {
    report.exitCode = 1003;
    report.cacheEntry = null;
    return { shouldPersist: false };
  }

  report.cacheEntry = currentEntry;
  return { shouldPersist: true };
}
