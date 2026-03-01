import { buildTxtRecordVariant } from '@agentcommunity/aid-engine';
import type { AuthToken } from '@agentcommunity/aid';

const ISO_8601_UTC_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const KID_PATTERN = /^[a-z0-9]{1,6}$/;

const PROTOCOL_SCHEMES = {
  mcp: ['https://'],
  a2a: ['https://'],
  ucp: ['https://'],
  openapi: ['https://'],
  grpc: ['https://'],
  graphql: ['https://'],
  websocket: ['wss://'],
  local: ['docker:', 'npx:', 'pip:'],
  zeroconf: ['zeroconf:'],
} as const;

const VALID_AUTH_TOKENS = new Set<AuthToken | ''>([
  '',
  'none',
  'pat',
  'apikey',
  'basic',
  'oauth2_device',
  'oauth2_code',
  'mtls',
  'custom',
]);

type GeneratorProtocol = keyof typeof PROTOCOL_SCHEMES;

interface GeneratorBody {
  domain: string;
  uri: string;
  proto: string;
  auth: string;
  desc: string;
  docs?: string;
  dep?: string;
  pka?: string;
  kid?: string;
}

interface Issue {
  code: string;
  message: string;
}

interface GeneratorJsonPreview {
  v: 'aid1';
  u?: string;
  p?: string;
  a?: string;
  s?: string;
  d?: string;
  e?: string;
  k?: string;
  i?: string;
}

export interface GeneratorValidationResponse {
  success: boolean;
  txt: string;
  json: GeneratorJsonPreview;
  bytes: { txt: number; desc: number };
  errors: Issue[];
  warnings: Issue[];
}

const isGeneratorProtocol = (value: string): value is GeneratorProtocol =>
  Object.hasOwn(PROTOCOL_SCHEMES, value);

const normalize = (payload: unknown): GeneratorBody => {
  const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return {
    domain: typeof body.domain === 'string' ? body.domain.trim() : '',
    uri: typeof body.uri === 'string' ? body.uri.trim() : '',
    proto: typeof body.proto === 'string' ? body.proto.trim() : '',
    auth: typeof body.auth === 'string' ? body.auth.trim() : '',
    desc: typeof body.desc === 'string' ? body.desc : '',
    docs: typeof body.docs === 'string' && body.docs.trim() ? body.docs.trim() : undefined,
    dep: typeof body.dep === 'string' && body.dep.trim() ? body.dep.trim() : undefined,
    pka: typeof body.pka === 'string' && body.pka.trim() ? body.pka.trim() : undefined,
    kid: typeof body.kid === 'string' && body.kid.trim() ? body.kid.trim() : undefined,
  };
};

const isValidDomain = (domain: string): boolean => {
  try {
    const url = new URL(`https://${domain}`);
    if (!url.hostname || url.hostname.includes('..')) {
      return false;
    }
    return url.hostname.split('.').every((label) => label.length > 0 && label.length <= 63);
  } catch {
    return false;
  }
};

const buildJsonPreview = (data: GeneratorBody): GeneratorJsonPreview => ({
  v: 'aid1',
  u: data.uri || undefined,
  p: data.proto || undefined,
  a: data.auth || undefined,
  s: data.desc || undefined,
  d: data.docs || undefined,
  e: data.dep || undefined,
  k: data.pka || undefined,
  i: data.kid || undefined,
});

const safeByteLength = (value: string): number => new TextEncoder().encode(value).length;

export const validateGeneratorPayload = (payload: unknown): GeneratorValidationResponse => {
  const data = normalize(payload);
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const descBytes = safeByteLength(data.desc);

  if (!data.domain || !isValidDomain(data.domain)) {
    errors.push({ code: 'ERR_DOMAIN', message: 'Invalid domain' });
  }
  if (!data.uri) {
    errors.push({ code: 'ERR_URI', message: 'URI is required' });
  }
  if (!data.proto) {
    errors.push({ code: 'ERR_PROTO', message: 'Protocol is required' });
  }
  if (data.proto && !isGeneratorProtocol(data.proto)) {
    errors.push({ code: 'ERR_PROTO_TOKEN', message: 'Unsupported protocol token' });
  }
  if (descBytes > 60) {
    errors.push({ code: 'ERR_DESC_BYTES', message: 'Description exceeds 60 bytes' });
  }
  if (data.docs && !data.docs.startsWith('https://')) {
    errors.push({ code: 'ERR_DOCS_HTTPS', message: 'Docs must use https://' });
  }
  if (data.dep && !ISO_8601_UTC_Z.test(data.dep)) {
    errors.push({ code: 'ERR_DEP_ISO', message: 'Dep must be ISO 8601 UTC Z' });
  }
  if (data.pka && !data.kid) {
    errors.push({
      code: 'ERR_KID_REQUIRED',
      message: 'Key ID (rotation) is required when PKA is present',
    });
  }
  if (data.kid && !KID_PATTERN.test(data.kid)) {
    errors.push({ code: 'ERR_KID_FORMAT', message: 'Key ID must be 1-6 chars [a-z0-9]' });
  }

  if (data.uri && isGeneratorProtocol(data.proto)) {
    const validScheme = PROTOCOL_SCHEMES[data.proto].some((prefix) => data.uri.startsWith(prefix));
    if (!validScheme) {
      errors.push({
        code: 'ERR_URI_SCHEME',
        message: `URI scheme not allowed for protocol ${data.proto}`,
      });
    }
  }

  const authValue = VALID_AUTH_TOKENS.has(data.auth as AuthToken | '')
    ? (data.auth as AuthToken | '')
    : '';

  let txt = '';
  let txtBytes = 0;
  if (data.uri && isGeneratorProtocol(data.proto)) {
    const engineData = {
      domain: data.domain,
      uri: data.uri,
      proto: data.proto,
      auth: authValue,
      desc: data.desc,
      docs: data.docs,
      dep: data.dep,
      pka: data.pka,
      kid: data.kid,
    };
    txt = buildTxtRecordVariant(engineData, true);
    txtBytes = safeByteLength(txt);

    if (txtBytes > 255) {
      warnings.push({ code: 'WARN_TXT_BYTES', message: 'TXT record exceeds 255 bytes' });
    }
  }

  return {
    success: errors.length === 0,
    txt,
    json: buildJsonPreview(data),
    bytes: { txt: txtBytes, desc: descBytes },
    errors,
    warnings,
  };
};
