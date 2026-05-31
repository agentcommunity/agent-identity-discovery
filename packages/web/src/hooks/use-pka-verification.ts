'use client';

import { useState, useCallback } from 'react';

export type PkaStatus = 'idle' | 'checking' | 'valid' | 'invalid';

export function usePkaVerification() {
  const [status, setStatus] = useState<PkaStatus>('idle');
  const [reason, setReason] = useState<string | null>(null);

  const check = useCallback((pka: string) => {
    setStatus('checking');
    const res = verifyPkaLocal(pka);
    if (res.valid) {
      setReason(null);
      setStatus('valid');
    } else {
      setReason(res.reason || 'Invalid PKA key');
      setStatus('invalid');
    }
  }, []);

  return { status, reason, check } as const;
}

function verifyPkaLocal(pka: string): { valid: boolean; reason?: string } {
  if (!pka) return { valid: false, reason: 'Missing PKA key' };
  if (!/^[A-Za-z0-9_-]+$/.test(pka) || pka.includes('=') || pka.length % 4 === 1) {
    return { valid: false, reason: 'PKA must be unpadded base64url' };
  }
  try {
    const padded =
      pka.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (pka.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (char) => char.codePointAt(0) ?? 0);
    if (bytes.length !== 32) return { valid: false, reason: 'Unexpected key length' };
    return { valid: true };
  } catch {
    return { valid: false, reason: 'PKA must be unpadded base64url' };
  }
}
