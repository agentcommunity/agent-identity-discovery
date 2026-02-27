import { type AidRecord } from './constants.js';
import { AidError } from './parser.js';

export type SecurityMode = 'balanced' | 'strict';
export type DnssecPolicy = 'off' | 'prefer' | 'require';
export type PkaPolicy = 'if-present' | 'require';
export type DowngradePolicy = 'off' | 'warn' | 'fail';
export type WellKnownPolicy = 'auto' | 'disable';

export interface PreviousSecurityState {
  pka?: string | null;
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
      `PKA is required by security policy for ${queryName}; publish pka and kid before using this endpoint`,
    );
  }
}

export function enforceDowngradePolicy(
  record: AidRecord,
  queryName: string,
  policy: ResolvedSecurityPolicy,
  security: DiscoverySecurity,
): void {
  if (policy.downgradePolicy === 'off' || !policy.previousSecurity) {
    return;
  }

  const previousPka = policy.previousSecurity.pka ?? null;
  const previousKid = policy.previousSecurity.kid ?? null;
  const currentPka = record.pka ?? null;
  const currentKid = record.kid ?? null;

  let reason: string | null = null;
  if (previousPka && !currentPka) {
    reason = 'previously present pka was removed';
  } else if (previousPka && currentPka && previousPka !== currentPka) {
    reason = 'pka value changed';
  } else if (previousKid && currentKid && previousKid !== currentKid) {
    reason = 'kid value changed';
  }

  if (!reason) {
    return;
  }

  security.downgrade.detected = true;
  security.downgrade.reason = reason;

  const message = `Security downgrade detected for ${queryName}: ${reason}`;
  if (policy.downgradePolicy === 'fail') {
    throw new AidError('ERR_SECURITY', message);
  }
  addSecurityWarning(security, {
    code: 'DOWNGRADE_DETECTED',
    message,
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
