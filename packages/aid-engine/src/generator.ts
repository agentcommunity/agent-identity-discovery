/**
 * @agentcommunity/aid-doctor - CLI tool for Agent Identity & Discovery
 *
 * This file contains the logic for the interactive record generator.
 */

import { parse } from '@agentcommunity/aid';
import type { ProtocolToken, AuthToken } from '@agentcommunity/aid';

// Export the types needed by the UI
export type AidGeneratorData = {
  uri: string;
  proto: ProtocolToken | '';
  auth: AuthToken | '';
  desc: string;
  domain: string;
  docs?: string;
  dep?: string; // ISO 8601 UTC Z
  pka?: string; // zBase58
  kid?: string; // 1-6 chars [a-z0-9]
};

const CANONICAL_TXT_KEYS = {
  version: 'v',
  uri: 'u',
  proto: 'p',
  auth: 'a',
  desc: 's',
  docs: 'd',
  dep: 'e',
  pka: 'k',
  kid: 'i',
} as const;

const LONG_KEY_NAMES = new Set([
  'version',
  'uri',
  'proto',
  'auth',
  'desc',
  'docs',
  'dep',
  'pka',
  'kid',
]);

// Canonical v1.x output always uses short keys. The legacy parameter is kept for call-site compatibility.
export function buildTxtRecordVariant(formData: AidGeneratorData, _useAliases?: boolean): string {
  void _useAliases;
  const parts: string[] = ['v=aid1'];
  if (formData.uri) parts.push(`${CANONICAL_TXT_KEYS.uri}=${formData.uri}`);
  if (formData.proto) parts.push(`${CANONICAL_TXT_KEYS.proto}=${formData.proto}`);
  if (formData.auth) parts.push(`${CANONICAL_TXT_KEYS.auth}=${formData.auth}`);
  if (formData.desc) parts.push(`${CANONICAL_TXT_KEYS.desc}=${formData.desc}`);
  if (formData.docs) parts.push(`${CANONICAL_TXT_KEYS.docs}=${formData.docs}`);
  if (formData.dep) parts.push(`${CANONICAL_TXT_KEYS.dep}=${formData.dep}`);
  if (formData.pka) parts.push(`${CANONICAL_TXT_KEYS.pka}=${formData.pka}`);
  if (formData.kid) parts.push(`${CANONICAL_TXT_KEYS.kid}=${formData.kid}`);
  return parts.join(';');
}

export function buildTxtRecord(formData: AidGeneratorData): string {
  return buildTxtRecordVariant(formData, true);
}

export function findLongKeyNames(record: string): string[] {
  const found = new Set<string>();
  for (const part of record.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim().toLowerCase();
    if (LONG_KEY_NAMES.has(key)) {
      found.add(key);
    }
  }
  return [...found];
}

// The validation logic
export function validateTxtRecord(record: string): { isValid: boolean; error?: string } {
  try {
    parse(record);
    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: error instanceof Error ? error.message : 'Invalid' };
  }
}
