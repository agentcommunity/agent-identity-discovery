import { isOk } from '@/lib/types/result';
import type { ProtocolToken } from '@/lib/datasources/types';
import type { DiscoveryData, DiscoveryMetadata, DiscoveryResult } from '@/hooks/use-discovery';
import type { HandshakeResult } from '@/hooks/use-connection';
import type { SignalDetail, StatusSignalMessage } from './types';

type SignalDraft = Omit<StatusSignalMessage, 'id' | 'type'>;
type DiscoveryContext = { record: DiscoveryData; metadata: DiscoveryMetadata };

interface ErrorLike {
  message?: string;
  name?: string;
  needsAuth?: boolean;
  errorCode?: string;
  code?: string | number;
  details?: Record<string, unknown>;
  authType?: string;
  metadataUri?: string;
  compliantAuth?: boolean;
}

const NUMERIC_ERROR_CODES: Record<number, string> = {
  1000: 'ERR_NO_RECORD',
  1001: 'ERR_INVALID_TXT',
  1002: 'ERR_UNSUPPORTED_PROTO',
  1003: 'ERR_SECURITY',
  1004: 'ERR_DNS_LOOKUP_FAILED',
  1005: 'ERR_FALLBACK_FAILED',
};

const isHttpsUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const formatValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable value]';
  }
};

export function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const err = error as ErrorLike;
  if (typeof err.errorCode === 'string') return err.errorCode;
  if (typeof err.code === 'string' && err.code.startsWith('ERR_')) return err.code;
  if (typeof err.code === 'number') return NUMERIC_ERROR_CODES[err.code];
  return undefined;
}

function getErrorDetails(error: unknown): SignalDetail[] {
  if (!error || typeof error !== 'object') {
    const primitive =
      typeof error === 'string' || typeof error === 'number' || typeof error === 'boolean'
        ? String(error)
        : 'Unknown error';
    return [{ label: 'Reason', value: primitive, tone: 'error' }];
  }
  const err = error as ErrorLike;
  const details: SignalDetail[] = [
    {
      label: 'Reason',
      value: err.message || 'Unknown error',
      tone: 'error',
    },
  ];

  const code = getErrorCode(error);
  if (code) {
    details.push({ label: 'Spec code', value: code, tone: 'warning' });
  }

  if (err.details && typeof err.details === 'object') {
    for (const [key, value] of Object.entries(err.details)) {
      details.push({
        label: key,
        value: formatValue(value),
      });
    }
  }

  return details;
}

function discoveryErrorHints(domain: string, code?: string): { title: string; hints: string[] } {
  switch (code) {
    case 'ERR_NO_RECORD':
      return {
        title: 'AID resolver failed',
        hints: [
          `Publish a TXT record at _agent.${domain}.`,
          'If DNS is correct, verify propagation with dig or a public DoH resolver.',
          'You can generate a compliant record from the workbench generator.',
        ],
      };
    case 'ERR_INVALID_TXT':
      return {
        title: 'AID record is invalid',
        hints: [
          'Ensure v=aid2 and both uri/proto are present.',
          'Do not mix full keys with single-letter aliases in the same record.',
          'If dep is set and in the past, rotate to a non-deprecated record.',
        ],
      };
    case 'ERR_UNSUPPORTED_PROTO':
      return {
        title: 'Protocol token is unsupported',
        hints: [
          'Use a supported protocol token (mcp, a2a, openapi, etc).',
          'If this is intentional, update the client to support the protocol.',
        ],
      };
    case 'ERR_SECURITY':
      return {
        title: 'Discovery blocked by security checks',
        hints: [
          'Check DNS/network access and public resolver reachability.',
          'If pka is present, verify the derived keyid and AID v2 handshake headers.',
          'Inspect TLS and redirect behavior on fallback endpoints.',
        ],
      };
    case 'ERR_DNS_LOOKUP_FAILED':
      return {
        title: 'DNS lookup failed',
        hints: [
          'Retry with another resolver and confirm nameserver delegation.',
          'Check firewall or captive network restrictions.',
          'Use .well-known fallback only when DNS is unavailable.',
        ],
      };
    case 'ERR_FALLBACK_FAILED':
      return {
        title: '.well-known fallback failed',
        hints: [
          'Serve application/json at https://<domain>/.well-known/agent.',
          'Ensure fallback payload is valid AID record JSON.',
          'Use DNS TXT as the canonical source when possible.',
        ],
      };
    default:
      return {
        title: 'AID resolver failed',
        hints: [
          'Check DNS, TXT formatting, and protocol fields.',
          'Inspect resolver errors and retry with a known working domain.',
        ],
      };
  }
}

const protocolUpper = (proto: string): string => proto.toUpperCase();

function formatPkaStatus(
  pka:
    | {
        present?: boolean;
        verified?: boolean | null;
      }
    | undefined,
): string {
  if (!pka?.present) return 'Not present';
  if (pka.verified === true) return 'Verified';
  if (pka.verified === false) return 'Verification failed';
  return 'Present (verification unknown)';
}

function formatTlsStatus(
  tls:
    | {
        valid?: boolean | null;
        daysRemaining?: number | null;
      }
    | undefined,
): string {
  if (!tls) return 'Not checked';
  if (tls.valid === true) {
    return typeof tls.daysRemaining === 'number'
      ? `Valid (${tls.daysRemaining} days remaining)`
      : 'Valid';
  }
  if (tls.valid === false) return 'Invalid';
  return 'Unknown';
}

export function isAuthRequiredResult(result: HandshakeResult): boolean {
  if (isOk(result)) return false;
  const error = result.error as ErrorLike;
  return Boolean(error?.needsAuth || error?.name === 'AuthRequiredError');
}

export function buildInputValidationSignal(input: string, reason: string): SignalDraft {
  return {
    stage: 'input',
    status: 'error',
    title: 'Invalid domain input',
    summary: 'Resolver accepts domains (or URLs that include a domain).',
    details: [
      { label: 'Input', value: input, tone: 'warning' },
      { label: 'Reason', value: reason, tone: 'error' },
    ],
    hints: ['Try a value like example.com or https://example.com.'],
  };
}

export function buildDiscoveryRunningSignal(domain: string): SignalDraft {
  return {
    stage: 'discovery',
    status: 'running',
    title: 'AID resolver running',
    summary: `Looking up _agent.${domain}.`,
    domain,
  };
}

export function buildDiscoveryResultSignal(domain: string, result: DiscoveryResult): SignalDraft {
  if (!isOk(result)) {
    const code = getErrorCode(result.error);
    const hints = discoveryErrorHints(domain, code);
    return {
      stage: 'discovery',
      status: 'error',
      title: hints.title,
      summary: `No usable AID record found for ${domain}.`,
      domain,
      errorCode: code,
      details: getErrorDetails(result.error),
      hints: hints.hints,
      discoveryResult: result,
    };
  }

  const { record, metadata } = result.value;
  const fallbackUsed = isHttpsUrl(metadata.dnsQuery);
  const dep = typeof record.dep === 'string' ? record.dep : undefined;
  const auth = typeof record.auth === 'string' ? record.auth : undefined;
  const docs = typeof record.docs === 'string' ? record.docs : undefined;
  const depDate = dep ? new Date(dep) : null;
  const depFuture =
    depDate instanceof Date && !Number.isNaN(depDate.getTime()) && depDate > new Date();

  const details: SignalDetail[] = [
    { label: 'Query', value: metadata.dnsQuery, tone: 'success' },
    { label: 'Protocol', value: String(record.proto) },
    { label: 'URI', value: String(record.uri) },
    { label: 'Lookup time', value: `${metadata.lookupTime}ms` },
  ];

  if (auth) details.push({ label: 'Auth hint', value: auth });
  if (docs) details.push({ label: 'Docs', value: docs });
  if (dep) {
    details.push({
      label: 'Deprecation',
      value: dep,
      tone: depFuture ? 'warning' : 'default',
    });
  }
  if (metadata.pka) {
    details.push({
      label: 'PKA',
      value: formatPkaStatus(metadata.pka),
      tone: metadata.pka.verified === false ? 'error' : 'default',
    });
    if (metadata.pka.keyid) {
      details.push({ label: 'PKA keyid', value: metadata.pka.keyid });
    }
  }
  if (metadata.tls) {
    details.push({
      label: 'TLS',
      value: formatTlsStatus(metadata.tls),
      tone: metadata.tls.valid === false ? 'error' : 'default',
    });
  }

  const hints: string[] = [];
  if (fallbackUsed) {
    hints.push('DNS lookup used the .well-known fallback endpoint for resolution.');
  }
  if (depFuture) {
    hints.push(`This record is scheduled for deprecation at ${record.dep}.`);
  }

  return {
    stage: 'discovery',
    status: 'success',
    title: fallbackUsed ? 'AID resolver succeeded via fallback' : 'AID resolver succeeded',
    summary: `${protocolUpper(String(record.proto))} endpoint discovered for ${domain}.`,
    domain,
    details,
    hints,
    discoveryResult: result,
  };
}

export function buildConnectionRunningSignal(discovery: DiscoveryContext): SignalDraft {
  const proto = String(discovery.record.proto ?? 'mcp');
  return {
    stage: 'connection',
    status: 'running',
    title: `${protocolUpper(proto)} connection running`,
    summary: `Attempting handshake with ${String(discovery.record.uri ?? '')}.`,
    details: [{ label: 'Protocol', value: proto }],
  };
}

function connectionErrorHints(proto: ProtocolToken, message: string): string[] {
  const hints =
    proto === 'mcp'
      ? [
          'Verify the endpoint is reachable and supports MCP initialize/listTools.',
          'If authentication is required, provide credentials and retry.',
          'Check TLS certificate validity and proxy/CORS behavior.',
        ]
      : [
          `Verify ${protocolUpper(proto)} endpoint reachability and protocol compatibility.`,
          'Review server logs for transport-level handshake failures.',
        ];

  if (/unsupported uri scheme/i.test(message)) {
    hints.unshift('Use an allowed URI scheme for this protocol token.');
  }
  if (/target host not allowed/i.test(message)) {
    hints.unshift('Workbench blocks localhost/private hosts for safety; use public endpoints.');
  }

  return hints;
}

export function buildConnectionResultSignal(
  discovery: DiscoveryContext,
  result: HandshakeResult,
): SignalDraft {
  const proto = String(discovery.record.proto ?? 'mcp') as ProtocolToken;
  const protoUpper = protocolUpper(proto);

  if (isOk(result)) {
    const guidance = result.value.guidance;
    if (guidance) {
      return {
        stage: 'connection',
        status: 'success',
        title: `${protoUpper} guidance available`,
        summary: 'Discovery succeeded. Use protocol guidance for the next client steps.',
        details: [
          { label: 'Protocol', value: proto },
          { label: 'URI', value: String(discovery.record.uri ?? '') },
          { label: 'Guidance', value: guidance.title, tone: 'success' },
        ],
        hints: guidance.nextSteps,
        connectionResult: { discovery, result },
      };
    }

    const capabilityCount = result.value.capabilities.length;
    const security = result.value.security;
    const details: SignalDetail[] = [
      { label: 'Protocol', value: proto },
      { label: 'Server', value: result.value.serverInfo.name, tone: 'success' },
      { label: 'Version', value: result.value.serverInfo.version },
      { label: 'Capabilities', value: String(capabilityCount) },
    ];

    if (security?.pka) {
      details.push({
        label: 'PKA',
        value: formatPkaStatus(security.pka),
        tone: security.pka.verified === false ? 'error' : 'default',
      });
      if (security.pka.keyid) {
        details.push({ label: 'PKA keyid', value: security.pka.keyid });
      }
    }
    if (security?.tls) {
      details.push({
        label: 'TLS',
        value: formatTlsStatus(security.tls),
        tone: security.tls.valid === false ? 'error' : 'default',
      });
    }

    const hints: string[] = [];
    if (capabilityCount === 0) {
      hints.push('Handshake succeeded but the server did not advertise capabilities.');
    }

    return {
      stage: 'connection',
      status: 'success',
      title: `Connected via ${proto}`,
      summary: `Handshake succeeded with ${capabilityCount} capabilities.`,
      details,
      hints,
      connectionResult: { discovery, result },
    };
  }

  const error = result.error as ErrorLike;
  const message = error.message || 'Unknown handshake error';
  const authType = error.authType;
  const metadataUri = error.metadataUri;

  if (isAuthRequiredResult(result)) {
    const hints = ['Provide credentials and retry the handshake once.'];
    if (authType) {
      hints.push(`Server auth hint: ${authType}.`);
    }
    if (metadataUri) {
      hints.push(`Auth metadata: ${metadataUri}`);
    }

    return {
      stage: 'connection',
      status: 'needs_auth',
      title: `${protoUpper} authentication required`,
      summary: 'Discovery succeeded but the endpoint requires authentication.',
      details: [
        { label: 'Protocol', value: proto },
        { label: 'URI', value: String(discovery.record.uri ?? '') },
        { label: 'Reason', value: message, tone: 'warning' },
        ...(authType ? [{ label: 'Auth type', value: authType }] : []),
        ...(metadataUri ? [{ label: 'Auth metadata', value: metadataUri }] : []),
      ],
      hints,
      connectionResult: { discovery, result },
    };
  }

  return {
    stage: 'connection',
    status: 'error',
    title: `${protoUpper} connection failed`,
    summary: 'Discovery succeeded, but handshake failed.',
    details: [
      { label: 'Protocol', value: proto },
      { label: 'URI', value: String(discovery.record.uri ?? '') },
      { label: 'Reason', value: message, tone: 'error' },
    ],
    hints: connectionErrorHints(proto, message),
    connectionResult: { discovery, result },
  };
}

export function buildAuthRetryRunningSignal(): SignalDraft {
  return {
    stage: 'auth',
    status: 'running',
    title: 'Authentication retry running',
    summary: 'Retrying connection with provided credentials.',
  };
}

export function buildAuthRetryResultSignal(
  discovery: DiscoveryContext,
  result: HandshakeResult,
): SignalDraft {
  const proto = String(discovery.record.proto ?? 'mcp');

  if (isOk(result)) {
    const capabilityCount = result.value.capabilities.length;
    return {
      stage: 'auth',
      status: 'success',
      title: 'Authentication retry succeeded',
      summary: `Connected to ${protocolUpper(proto)} endpoint after authentication.`,
      details: [
        { label: 'Protocol', value: proto, tone: 'success' },
        { label: 'Capabilities', value: String(capabilityCount) },
      ],
      connectionResult: { discovery, result },
    };
  }

  if (isAuthRequiredResult(result)) {
    const error = result.error as ErrorLike;
    return {
      stage: 'auth',
      status: 'needs_auth',
      title: 'Authentication retry rejected',
      summary: 'The endpoint still requires valid credentials.',
      details: [
        { label: 'Reason', value: error.message || 'Authentication required', tone: 'error' },
      ],
      connectionResult: { discovery, result },
      hints: ['Verify token scope/expiry and retry with a fresh credential.'],
    };
  }

  const error = result.error as ErrorLike;
  return {
    stage: 'auth',
    status: 'error',
    title: 'Authentication retry failed',
    summary: 'Connection could not be established with the provided credentials.',
    details: [{ label: 'Reason', value: error.message || 'Unknown error', tone: 'error' }],
    connectionResult: { discovery, result },
    hints: ['Confirm endpoint reachability and authentication method compatibility.'],
  };
}
