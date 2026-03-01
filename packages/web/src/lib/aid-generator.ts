/**
 * @/lib/aid-generator - Standalone logic for generating AID records.
 *
 * It's placed here to be used by the GeneratorPanel component.
 */

// Avoid importing engine in client bundle; implement a lightweight builder/validator here.
import type { ProtocolToken, AuthToken } from '@agentcommunity/aid';

// Export the types needed by the UI
export interface AidGeneratorData {
  uri: string;
  proto: ProtocolToken | '';
  auth: AuthToken | '';
  desc: string;
  domain: string;
  docs?: string;
  dep?: string; // ISO timestamp
  pka?: string;
  kid?: string;
}

// The core logic function
export function buildTxtRecord(formData: AidGeneratorData): string {
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

// The validation logic
export function validateTxt(record: string): { isValid: boolean; error?: string } {
  try {
    // minimally validate presence of required keys
    const map = new Map(
      record.split(';').map((p) => [p.split('=')[0]?.trim(), p.slice(p.indexOf('=') + 1)]),
    );
    const v = map.get('v') ?? map.get('version');
    const uri = map.get('u') ?? map.get('uri');
    const proto = map.get('p') ?? map.get('proto');
    if (v !== 'aid1') throw new Error('Missing or invalid version (v=aid1)');
    if (!uri) throw new Error('Missing uri/u');
    if (!proto) throw new Error('Missing proto/p');
    if (map.get('i') && !map.get('k') && !map.get('pka')) throw new Error('kid requires pka');
    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: error instanceof Error ? error.message : 'Invalid' };
  }
}
