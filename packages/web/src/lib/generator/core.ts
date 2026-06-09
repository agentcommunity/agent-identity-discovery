import type { AidGeneratorFormData, ValidationResult } from './types';

export function computeBytes(txt: string, desc: string): { txtBytes: number; descBytes: number } {
  return {
    txtBytes: new TextEncoder().encode(txt).length,
    descBytes: new TextEncoder().encode(desc || '').length,
  };
}

export function buildTxtRecord(data: AidGeneratorFormData): string {
  const parts: string[] = ['v=aid2'];
  if (data.uri) parts.push(`u=${data.uri}`);
  if (data.proto) parts.push(`p=${data.proto}`);
  if (data.auth) parts.push(`a=${data.auth}`);
  if (data.desc) parts.push(`s=${data.desc}`);
  if (data.docs) parts.push(`d=${data.docs}`);
  if (data.dep) parts.push(`e=${data.dep}`);
  if (data.pka) parts.push(`k=${data.pka}`);
  return parts.join(';');
}

export function buildWellKnownJson(data: AidGeneratorFormData): Record<string, string> {
  const o: Record<string, string> = { v: 'aid2' };
  const put = (alias: string, val?: string) => {
    if (!val) return;
    o[alias] = val;
  };
  put('u', data.uri);
  put('p', data.proto);
  put('a', data.auth);
  put('s', data.desc);
  put('d', data.docs);
  put('e', data.dep);
  put('k', data.pka);
  return o;
}

export function validate(data: AidGeneratorFormData): ValidationResult {
  const errors: ValidationResult['errors'] = [];
  const warnings: ValidationResult['warnings'] = [];

  // Required
  if (!data.uri) errors.push({ code: 'ERR_URI', message: 'URI is required' });
  if (!data.proto) errors.push({ code: 'ERR_PROTO', message: 'Protocol is required' });

  // Protocol registry (subset here; extend if needed)
  const allowed: Record<string, readonly string[]> = {
    mcp: ['https://'],
    a2a: ['https://'],
    openapi: ['https://'],
    grpc: ['https://'],
    graphql: ['https://'],
    ucp: ['https://'],
    websocket: ['wss://'],
    local: ['docker:', 'npx:', 'pip:'],
    zeroconf: ['zeroconf:'],
  };
  if (data.proto && !allowed[data.proto]) {
    errors.push({ code: 'ERR_PROTO_TOKEN', message: 'Unsupported protocol token' });
  }
  if (data.uri && data.proto && allowed[data.proto]) {
    const ok = allowed[data.proto].some((scheme) => data.uri.startsWith(scheme));
    if (!ok)
      errors.push({ code: 'ERR_URI_SCHEME', message: 'URI scheme not allowed for protocol' });
  }

  // Description byte limit
  const descBytes = new TextEncoder().encode(data.desc || '').length;
  if (descBytes > 60)
    errors.push({ code: 'ERR_DESC_BYTES', message: 'Description exceeds 60 bytes' });

  // docs should be https
  if (data.docs && !data.docs.startsWith('https://')) {
    errors.push({ code: 'ERR_DOCS_HTTPS', message: 'Docs must use https://' });
  }

  // dep ISO 8601 Z check (basic)
  if (data.dep) {
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
    if (!iso.test(data.dep))
      errors.push({ code: 'ERR_DEP_ISO', message: 'Dep must be ISO 8601 UTC Z' });
  }

  if (data.pka && !isValidBase64UrlEd25519(data.pka)) {
    errors.push({ code: 'ERR_PKA_FORMAT', message: 'PKA must be unpadded base64url Ed25519' });
  }

  // Byte length for TXT
  const txt = buildTxtRecord(data);
  const totalBytes = byteLen(txt);
  if (totalBytes > 255)
    warnings.push({ code: 'WARN_TXT_BYTES', message: 'TXT record exceeds 255 bytes' });

  return { isValid: errors.length === 0, errors, warnings };
}

export function parseRecordString(str: string): Partial<AidGeneratorFormData> {
  const map = new Map(
    str
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf('=');
        const k = p.slice(0, i).trim().toLowerCase();
        const v = p.slice(i + 1);
        return [k, v];
      }),
  );
  const get = (...keys: string[]) => keys.map((k) => map.get(k)).find(Boolean);
  const out: Partial<AidGeneratorFormData> = {};
  const uri = get('u', 'uri');
  if (uri) out.uri = uri;
  const proto = get('p', 'proto');
  if (proto) out.proto = proto;
  const auth = get('a', 'auth');
  if (auth) out.auth = auth;
  const desc = get('s', 'desc');
  if (desc) out.desc = desc;
  const docs = get('d', 'docs');
  if (docs) out.docs = docs;
  const dep = get('e', 'dep');
  if (dep) out.dep = dep;
  const pka = get('k', 'pka');
  if (pka) out.pka = pka;
  return out;
}

function isValidBase64UrlEd25519(s: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(s) || s.includes('=') || s.length % 4 === 1) return false;
  try {
    const padded =
      s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (s.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (char) => char.codePointAt(0) ?? 0);
    return bytes.length === 32;
  } catch {
    return false;
  }
}

function byteLen(s: string): number {
  return new TextEncoder().encode(s).length;
}
