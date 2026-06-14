import type {
  AidRecord,
  DnssecPolicy,
  DowngradePolicy,
  PkaPolicy,
  PreviousSecurityState,
  SecurityMode,
  WellKnownPolicy,
} from '@agentcommunity/aid';

export interface CacheEntry {
  lastSeen: string;
  version?: string | null;
  trustSource?: 'dns' | 'well-known-tls';
  pka: string | null;
  kid: string | null;
  keyid?: string | null;
  jwkX?: string | null;
  domainBound?: boolean | null;
  hash?: string | null;
}

export interface ProbeAttempt {
  name: string;
  type: 'TXT' | 'RRSIG';
  result: 'NOERROR' | 'NXDOMAIN' | 'NODATA' | 'ERROR';
  ttl?: number | undefined;
  byteLength?: number;
  reason?: string;
}

export interface QueriedBlock {
  strategy: 'base-first';
  hint: { proto?: string | undefined; source: 'cli' | null; present: boolean };
  attempts: ProbeAttempt[];
  wellKnown: {
    attempted: boolean;
    used: boolean;
    url: string | null;
    httpStatus: number | null;
    contentType: string | null;
    byteLength: number | null;
    status:
      | 'ok'
      | 'not_found'
      | 'http_error'
      | 'bad_content_type'
      | 'invalid_json'
      | 'oversize'
      | null;
    snippet: string | null;
  };
}

export interface RecordBlock {
  raw: string | null;
  parsed: Partial<AidRecord> | null;
  valid: boolean;
  warnings: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string }>;
}

export interface DnssecBlock {
  present: boolean;
  method: 'RRSIG';
  proof: unknown | null;
}

export interface TlsBlock {
  checked: boolean;
  valid: boolean | null;
  host: string | null;
  sni: string | null;
  issuer: string | null;
  san: string[] | null;
  validFrom: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  redirectBlocked: boolean | null;
}

export interface PkaBlock {
  present: boolean;
  attempted: boolean;
  verified: boolean | null;
  domainBound?: boolean | null;
  kid: string | null;
  keyid: string | null;
  alg: string | null;
  createdSkewSec: number | null;
  covered: string[] | null;
}

export interface DowngradeBlock {
  checked: boolean;
  previous: {
    pka: string | null;
    kid: string | null;
    keyid?: string | null;
    version?: string | null;
    trustSource?: 'dns' | 'well-known-tls' | null;
  } | null;
  status:
    | 'no_change'
    // Legacy aliases retained for public API compatibility with older reports.
    // Current runCheck output uses pka_removed/key_replaced or more specific statuses.
    | 'downgrade'
    | 'key_rotation'
    | 'first_seen'
    | 'pka_added'
    | 'pka_removed'
    | 'key_replaced'
    | 'version_downgrade'
    | 'binding_loss'
    | 'fallback_well_known_tls'
    | null;
}

export interface DoctorReport {
  domain: string;
  queried: QueriedBlock;
  record: RecordBlock;
  dnssec: DnssecBlock;
  tls: TlsBlock;
  pka: PkaBlock;
  downgrade: DowngradeBlock;
  exitCode: number;
  cacheEntry: CacheEntry | null;
}

export interface CheckOptions {
  protocol?: string;
  probeProtoSubdomain?: boolean;
  probeProtoEvenIfBase?: boolean;
  timeoutMs: number;
  allowFallback: boolean;
  wellKnownTimeoutMs: number;
  securityMode?: SecurityMode;
  dnssecPolicy?: DnssecPolicy;
  pkaPolicy?: PkaPolicy;
  downgradePolicy?: DowngradePolicy;
  wellKnownPolicy?: WellKnownPolicy;
  previousSecurity?: PreviousSecurityState;
  showDetails?: boolean;
  dumpWellKnownPath?: string | null;
  checkDowngrade?: boolean;
  previousCacheEntry?: CacheEntry;
}
