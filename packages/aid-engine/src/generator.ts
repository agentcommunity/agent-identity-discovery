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

// The core logic function
export function buildTxtRecordVariant(formData: AidGeneratorData, useAliases: boolean): string {
  // Canonical TXT wire policy: always emit short keys to minimize byte size and avoid drift.
  // Keep `useAliases` in the signature for backward compatibility with existing callers.
  void useAliases;
  const parts: string[] = ['v=aid1'];
  if (formData.uri) parts.push(`u=${formData.uri}`);
  if (formData.proto) parts.push(`p=${formData.proto}`);
  if (formData.auth) parts.push(`a=${formData.auth}`);
  if (formData.desc) parts.push(`s=${formData.desc}`);
  if (formData.docs) parts.push(`d=${formData.docs}`);
  if (formData.dep) parts.push(`e=${formData.dep}`);
  if (formData.pka) parts.push(`k=${formData.pka}`);
  if (formData.kid) parts.push(`i=${formData.kid}`);
  return parts.join(';');
}

export function buildTxtRecord(formData: AidGeneratorData): string {
  const full = buildTxtRecordVariant(formData, false);
  const alias = buildTxtRecordVariant(formData, true);
  // Prefer alias if it reduces size otherwise use full
  return new TextEncoder().encode(alias).length <= new TextEncoder().encode(full).length
    ? alias
    : full;
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
