import { type AidRecord, type AidSpecVersion } from './constants.js';
import { AidError } from './parser.js';

let nodeWebcrypto: unknown;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodeCrypto = require('node:crypto');
  nodeWebcrypto = nodeCrypto.webcrypto;
} catch {
  // Browser runtime.
}

export type SecurityMode = 'balanced' | 'strict';
export type DnssecPolicy = 'off' | 'prefer' | 'require';
export type PkaPolicy = 'if-present' | 'require';
export type DowngradePolicy = 'off' | 'warn' | 'fail';
export type WellKnownPolicy = 'auto' | 'disable';

export interface PreviousSecurityState {
  domain?: string;
  queriedName?: string;
  proto?: string;
  version?: AidSpecVersion;
  uri?: string;
  keyThumbprints?: string[];
  trustSource?: 'dns' | 'well-known-tls';
  dnssecValidated?: boolean | null;
  observedAt?: string;
  /** Legacy cache shape retained for read-old/write-new migration. */
  pka?: string | null;
  /** Legacy aid1 DNS kid retained only for migration. */
  kid?: string | null;
}

export interface SecurityPolicyOptions {
  securityMode?: SecurityMode;
  dnssecPolicy?: DnssecPolicy;
  pkaPolicy?: PkaPolicy;
  downgradePolicy?: DowngradePolicy;
  wellKnownPolicy?: WellKnownPolicy;
  previousSecurity?: PreviousSecurityState;
}

export interface DiscoverySecurityWarning {
  code: 'DNSSEC_PREFERRED' | 'DOWNGRADE_DETECTED' | 'WELL_KNOWN_PREFERRED';
  message: string;
}

export interface DiscoverySecurity {
  mode: 'default' | SecurityMode | 'custom';
  dnssec: {
    policy: DnssecPolicy;
    checked: boolean;
    validated: boolean | null;
  };
  pka: {
    policy: PkaPolicy;
    present: boolean;
  };
  wellKnown: {
    policy: WellKnownPolicy;
    used: boolean;
  };
  downgrade: {
    policy: DowngradePolicy;
    checked: boolean;
    detected: boolean;
    reason: string | null;
  };
  warnings: DiscoverySecurityWarning[];
}

export interface ResolvedSecurityPolicy {
  mode: DiscoverySecurity['mode'];
  dnssecPolicy: DnssecPolicy;
  pkaPolicy: PkaPolicy;
  downgradePolicy: DowngradePolicy;
  wellKnownPolicy: WellKnownPolicy;
  previousSecurity?: PreviousSecurityState;
}

export function resolveSecurityPolicy(options: {
  securityMode?: SecurityMode;
  dnssecPolicy?: DnssecPolicy;
  pkaPolicy?: PkaPolicy;
  downgradePolicy?: DowngradePolicy;
  wellKnownPolicy?: WellKnownPolicy;
  previousSecurity?: PreviousSecurityState;
  wellKnownFallback?: boolean;
}): ResolvedSecurityPolicy {
  const defaultPolicy: ResolvedSecurityPolicy = {
    mode: 'default',
    dnssecPolicy: 'off',
    pkaPolicy: 'if-present',
    downgradePolicy: 'off',
    wellKnownPolicy: options.wellKnownFallback === false ? 'disable' : 'auto',
    ...(options.previousSecurity ? { previousSecurity: options.previousSecurity } : {}),
  };

  if (!options.securityMode) {
    return {
      ...defaultPolicy,
      dnssecPolicy: options.dnssecPolicy ?? defaultPolicy.dnssecPolicy,
      pkaPolicy: options.pkaPolicy ?? defaultPolicy.pkaPolicy,
      downgradePolicy: options.downgradePolicy ?? defaultPolicy.downgradePolicy,
      wellKnownPolicy: options.wellKnownPolicy ?? defaultPolicy.wellKnownPolicy,
    };
  }

  const preset =
    options.securityMode === 'strict'
      ? {
          mode: 'strict' as const,
          dnssecPolicy: 'require' as const,
          pkaPolicy: 'require' as const,
          downgradePolicy: 'fail' as const,
          wellKnownPolicy: 'disable' as const,
        }
      : {
          mode: 'balanced' as const,
          dnssecPolicy: 'prefer' as const,
          pkaPolicy: 'if-present' as const,
          downgradePolicy: 'warn' as const,
          wellKnownPolicy: 'auto' as const,
        };

  const overrideUsed =
    options.dnssecPolicy !== undefined ||
    options.pkaPolicy !== undefined ||
    options.downgradePolicy !== undefined ||
    options.wellKnownPolicy !== undefined ||
    options.wellKnownFallback === false;

  return {
    mode: overrideUsed ? 'custom' : preset.mode,
    dnssecPolicy: options.dnssecPolicy ?? preset.dnssecPolicy,
    pkaPolicy: options.pkaPolicy ?? preset.pkaPolicy,
    downgradePolicy: options.downgradePolicy ?? preset.downgradePolicy,
    wellKnownPolicy:
      options.wellKnownPolicy ??
      (options.wellKnownFallback === false ? 'disable' : preset.wellKnownPolicy),
    ...(options.previousSecurity ? { previousSecurity: options.previousSecurity } : {}),
  };
}

export function createDiscoverySecurity(
  policy: ResolvedSecurityPolicy,
  usedWellKnown: boolean,
): DiscoverySecurity {
  return {
    mode: policy.mode,
    dnssec: {
      policy: policy.dnssecPolicy,
      checked: false,
      validated: null,
    },
    pka: {
      policy: policy.pkaPolicy,
      present: false,
    },
    wellKnown: {
      policy: policy.wellKnownPolicy,
      used: usedWellKnown,
    },
    downgrade: {
      policy: policy.downgradePolicy,
      checked: policy.downgradePolicy !== 'off' && Boolean(policy.previousSecurity),
      detected: false,
      reason: null,
    },
    warnings: [],
  };
}

export function addSecurityWarning(
  security: DiscoverySecurity,
  warning: DiscoverySecurityWarning,
): void {
  security.warnings.push(warning);
  console.warn(`[AID] WARNING: ${warning.message}`);
}

export function enforcePkaPolicy(
  record: AidRecord,
  queryName: string,
  security: DiscoverySecurity,
): void {
  security.pka.present = Boolean(record.pka);
  if (security.pka.policy === 'require' && !record.pka) {
    throw new AidError(
      'ERR_SECURITY',
      `PKA is required by security policy for ${queryName}; publish pka before using this endpoint`,
    );
  }
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP = new Map<string, number>(Array.from(B58).map((c, i) => [c, i]));

function uint8ToBase64Url(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToUint8(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.includes('=')) {
    throw new AidError('ERR_SECURITY', 'Invalid aid2 PKA encoding');
  }
  const remainder = value.length % 4;
  if (remainder === 1) {
    throw new AidError('ERR_SECURITY', 'Invalid aid2 PKA encoding');
  }
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - remainder) % 4);
  return base64ToUint8(padded);
}

function base58Decode(value: string): Uint8Array {
  if (!value) return new Uint8Array();
  let zeros = 0;
  while (zeros < value.length && value[zeros] === '1') zeros++;
  const size = (((value.length - zeros) * Math.log(58)) / Math.log(256) + 1) | 0;
  const bytes = new Uint8Array(size);
  for (let i = zeros; i < value.length; i++) {
    const digit = B58_MAP.get(value[i]);
    if (digit === undefined) throw new AidError('ERR_SECURITY', 'Invalid base58 character');
    let carry = digit;
    for (let j = size - 1; j >= 0; j--) {
      carry += 58 * bytes[j];
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
  }
  let start = 0;
  while (start < bytes.length && bytes[start] === 0) start++;
  const out = new Uint8Array(zeros + (bytes.length - start));
  out.fill(0, 0, zeros);
  out.set(bytes.subarray(start), zeros);
  return out;
}

function decodePkaToJwkX(pka: string, version?: AidSpecVersion): string {
  if (version === 'aid1' || pka.startsWith('z')) {
    if (!pka.startsWith('z')) throw new AidError('ERR_SECURITY', 'Unsupported multibase prefix');
    const publicKey = base58Decode(pka.slice(1));
    if (publicKey.length !== 32) throw new AidError('ERR_SECURITY', 'Invalid PKA length');
    return uint8ToBase64Url(publicKey);
  }

  const publicKey = base64UrlToUint8(pka);
  if (publicKey.length !== 32) throw new AidError('ERR_SECURITY', 'Invalid PKA length');
  return pka;
}

async function sha256Base64Url(input: string): Promise<string> {
  const cryptoImpl =
    (globalThis as unknown as { crypto?: Crypto }).crypto ?? (nodeWebcrypto as Crypto | undefined);
  if (!cryptoImpl?.subtle) {
    throw new AidError('ERR_SECURITY', 'crypto.subtle is not available in this environment');
  }
  const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return uint8ToBase64Url(new Uint8Array(digest));
}

async function derivePkaThumbprint(
  pka: string | null | undefined,
  version?: AidSpecVersion,
): Promise<string | null> {
  if (!pka) return null;
  const jwkX = decodePkaToJwkX(pka, version);
  return sha256Base64Url(`{"crv":"Ed25519","kty":"OKP","x":"${jwkX}"}`);
}

async function collectPreviousThumbprints(state: PreviousSecurityState): Promise<string[]> {
  if (state.keyThumbprints?.length) {
    return state.keyThumbprints;
  }
  try {
    const thumbprint = await derivePkaThumbprint(state.pka, state.version);
    return thumbprint ? [thumbprint] : [];
  } catch {
    return [];
  }
}

export async function enforceDowngradePolicy(
  record: AidRecord,
  queryName: string,
  policy: ResolvedSecurityPolicy,
  security: DiscoverySecurity,
): Promise<void> {
  if (policy.downgradePolicy === 'off' || !policy.previousSecurity) {
    return;
  }

  const previousState = policy.previousSecurity;
  const previousPka = previousState.pka ?? null;
  const currentPka = record.pka ?? null;
  const previousThumbprints = await collectPreviousThumbprints(previousState);
  let currentThumbprint: string | null = null;
  try {
    currentThumbprint = await derivePkaThumbprint(currentPka, record.v);
  } catch {
    currentThumbprint = null;
  }

  const previousHadPka = previousThumbprints.length > 0 || Boolean(previousPka);
  const currentHasPka = Boolean(currentThumbprint || currentPka);
  const isRemoval = previousHadPka && !currentHasPka;
  const sameDerivedKey = Boolean(
    currentThumbprint && previousThumbprints.some((thumbprint) => thumbprint === currentThumbprint),
  );
  const sameLegacyRawKey = Boolean(
    !currentThumbprint && previousPka && currentPka && previousPka === currentPka,
  );
  const isKeyChange = previousHadPka && currentHasPka && !sameDerivedKey && !sameLegacyRawKey;
  const isVersionDowngrade = previousState.version === 'aid2' && record.v === 'aid1';
  const isFallbackTrustDowngrade =
    previousState.trustSource === 'dns' && security.wellKnown.used === true;

  if (!isRemoval && !isKeyChange && !isVersionDowngrade && !isFallbackTrustDowngrade) {
    return;
  }

  const reason = isVersionDowngrade
    ? 'version downgraded from aid2 to aid1'
    : isFallbackTrustDowngrade
      ? 'DNS record unavailable; using well-known-tls trust'
      : isRemoval
        ? 'previously present pka was removed'
        : 'pka key thumbprint changed';

  security.downgrade.detected = true;
  security.downgrade.reason = reason;

  if (policy.downgradePolicy === 'fail') {
    throw new AidError('ERR_SECURITY', `Security downgrade detected for ${queryName}: ${reason}`);
  }
  addSecurityWarning(security, {
    code: 'DOWNGRADE_DETECTED',
    message: `Security downgrade detected for ${queryName}: ${reason}`,
  });
}

export function enforceDnssecPolicy(
  security: DiscoverySecurity,
  queryName: string,
  validated: boolean | null,
): void {
  security.dnssec.checked = validated !== null;
  security.dnssec.validated = validated;

  if (security.dnssec.policy === 'off') {
    return;
  }

  if (validated) {
    return;
  }

  const message =
    validated === null
      ? `DNSSEC could not be evaluated for ${queryName}`
      : `DNSSEC validation was not available for ${queryName}`;

  if (security.dnssec.policy === 'require') {
    throw new AidError('ERR_SECURITY', message);
  }

  addSecurityWarning(security, {
    code: 'DNSSEC_PREFERRED',
    message,
  });
}

export function enforceWellKnownPolicy(security: DiscoverySecurity, queryName: string): void {
  if (security.wellKnown.policy === 'disable') {
    throw new AidError(
      'ERR_SECURITY',
      `Well-known fallback is disabled by security policy for ${queryName}`,
    );
  }

  if (security.dnssec.policy === 'require') {
    throw new AidError(
      'ERR_SECURITY',
      `DNSSEC is required by security policy for ${queryName}; .well-known fallback cannot satisfy that requirement`,
    );
  }

  if (security.dnssec.policy === 'prefer') {
    addSecurityWarning(security, {
      code: 'WELL_KNOWN_PREFERRED',
      message: `Well-known fallback was used for ${queryName}; DNSSEC preference could not be satisfied on this path`,
    });
  }
}
