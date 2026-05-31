import type { SpecAdapter, CanonicalError, CanonicalHandshake, CanonicalRecord } from './types';

// Current app-level shapes
import type { DiscoveryData } from '@/hooks/use-discovery';
import type { HandshakeSuccessData } from '@/hooks/use-connection';

// Generated spec types (from protocol/constants.yml)
import type { AidRecordV1, HandshakeV1 } from '@/generated/spec';

function isDiscoveryData(x: unknown): x is DiscoveryData {
  return (
    typeof x === 'object' &&
    x !== null &&
    'uri' in x &&
    'proto' in x &&
    typeof (x as { uri?: unknown }).uri === 'string' &&
    typeof (x as { proto?: unknown }).proto === 'string'
  );
}

function isAidRecordV1Raw(x: unknown): x is AidRecordV1 {
  return (
    typeof x === 'object' &&
    x !== null &&
    'uri' in x &&
    'proto' in x &&
    typeof (x as { uri?: unknown }).uri === 'string' &&
    typeof (x as { proto?: unknown }).proto === 'string'
  );
}

const normalizeRecord = (raw: unknown): CanonicalRecord | null => {
  if (!isDiscoveryData(raw) && !isAidRecordV1Raw(raw)) return null;
  const uri = raw.uri;
  let host: string | undefined = (raw as Partial<DiscoveryData>).host;
  let port: number | undefined = (raw as Partial<DiscoveryData>).port;

  if (!host || !port) {
    try {
      const u = new URL(uri);
      host = host ?? u.hostname;
      port = port ?? (u.port ? Number.parseInt(u.port, 10) : 443);
    } catch {
      // ignore parse errors
    }
  }

  const { proto } = raw as { proto: string };
  const desc = (raw as { desc?: string }).desc;
  const auth = (raw as { auth?: unknown }).auth;

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as unknown as Record<string, unknown>)) {
    if (!['v', 'uri', 'proto', 'host', 'port', 'desc', 'auth'].includes(k)) extra[k] = v;
  }

  return {
    uri,
    proto,
    host: host ?? 'unknown',
    port: port ?? 443,
    desc,
    auth,
    extra,
  };
};

function isHandshakeLike(x: unknown): x is HandshakeSuccessData | HandshakeV1 {
  return typeof x === 'object' && x !== null && 'protocolVersion' in x && 'serverInfo' in x;
}

type Cap = { id: string; type: 'tool' | 'resource'; name?: string; description?: string };
function isCap(x: unknown): x is Cap {
  return (
    (typeof x === 'object' &&
      x !== null &&
      'id' in x &&
      'type' in x &&
      (x as { type: unknown }).type === 'tool') ||
    (x as { type: unknown }).type === 'resource'
  );
}

const normalizeHandshake = (raw: unknown): CanonicalHandshake | null => {
  if (!isHandshakeLike(raw)) return null;
  const protocolVersion = (raw as { protocolVersion: string }).protocolVersion;
  const serverInfo = (raw as { serverInfo: { name: string; version: string } }).serverInfo;
  const capsUnknown = (raw as { capabilities?: unknown }).capabilities;
  const capabilities: CanonicalHandshake['capabilities'] = Array.isArray(capsUnknown)
    ? capsUnknown
        .filter((c): c is Cap => isCap(c))
        .map((c) => ({
          id: c.id,
          type: c.type,
          name: c.name,
          description: c.description,
          extra: {},
        }))
    : [];

  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as unknown as Record<string, unknown>)) {
    if (!['protocolVersion', 'serverInfo', 'capabilities'].includes(k)) extra[k] = v;
  }

  return { protocolVersion, serverInfo, capabilities, extra };
};

const normalizeError = (raw: unknown): CanonicalError => {
  if (raw instanceof Error) {
    return { message: raw.message };
  }
  if (typeof raw === 'string') return { message: raw };
  try {
    return { message: JSON.stringify(raw) };
  } catch {
    return { message: 'Unknown error' };
  }
};

export const v1Adapter: SpecAdapter = {
  normalizeRecord,
  normalizeHandshake,
  normalizeError,
};
