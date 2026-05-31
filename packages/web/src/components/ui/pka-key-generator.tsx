import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy } from 'lucide-react';

export interface PkaKeyGeneratorProps {
  onPublicKey?: (pka: string) => void;
}

export function PkaKeyGenerator({ onPublicKey }: PkaKeyGeneratorProps) {
  const publicKeyId = useId();
  const keyIdId = useId();
  const privateKeyId = useId();
  const [publicKey, setPublicKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [keyId, setKeyId] = useState('');
  const [status, setStatus] = useState<'idle' | 'generating' | 'ready' | 'invalid'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setKeyId('');

    if (!verifyPkaLocal(publicKey).valid) return;

    void deriveJwkThumbprint(publicKey)
      .then((thumbprint) => {
        if (!cancelled) setKeyId(thumbprint);
      })
      .catch(() => {
        if (!cancelled) setKeyId('');
      });

    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  async function handleGenerate() {
    setStatus('generating');
    setError(null);
    try {
      const kp = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
      const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
      const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
      const pka = b64url(rawPub);
      const pem = '-----BEGIN PRIVATE KEY-----\n' + b64(pkcs8) + '\n-----END PRIVATE KEY-----\n';
      setPublicKey(pka);
      setPrivateKey(pem);
      setStatus('ready');
      onPublicKey?.(pka);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : 'Failed to generate keys');
      setStatus('idle');
    }
  }

  function handleValidate(): void {
    const r = verifyPkaLocal(publicKey);
    setStatus(r.valid ? 'ready' : 'invalid');
    setError(r.valid ? null : r.reason || 'Invalid PKA key');
  }

  function handlePublicKeyChange(value: string): void {
    setPublicKey(value);
    setError(null);
    if (status === 'invalid') setStatus('idle');
  }

  const copyPublic = () => {
    void navigator.clipboard.writeText(publicKey);
  };
  const copyKeyId = () => {
    void navigator.clipboard.writeText(keyId);
  };
  const copyPrivate = () => {
    void navigator.clipboard.writeText(privateKey);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">PKA Key Generator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button
            onClick={() => {
              void handleGenerate();
            }}
            disabled={status === 'generating'}
          >
            {status === 'generating' ? 'Generating…' : 'Generate Key Pair'}
          </Button>
          <Button variant="secondary" onClick={handleValidate} disabled={!publicKey}>
            Validate Public Key
          </Button>
        </div>
        <div className="space-y-2">
          <label htmlFor={publicKeyId} className="text-sm font-medium">
            Public Key (base64url JWK x)
          </label>
          <div className="flex gap-2">
            <Input
              id={publicKeyId}
              value={publicKey}
              onChange={(e) => handlePublicKeyChange(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={copyPublic}
              disabled={!publicKey}
              aria-label="Copy public key"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor={keyIdId} className="text-sm font-medium">
            Key ID (RFC 7638 JWK thumbprint)
          </label>
          <div className="flex gap-2">
            <Input
              id={keyIdId}
              value={keyId}
              readOnly
              placeholder="Derived after a valid public key is generated or entered"
            />
            <Button
              variant="outline"
              onClick={copyKeyId}
              disabled={!keyId}
              aria-label="Copy key ID"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor={privateKeyId} className="text-sm font-medium">
            Private Key (PEM)
          </label>
          <div className="flex gap-2">
            <Input
              id={privateKeyId}
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={copyPrivate}
              disabled={!privateKey}
              aria-label="Copy private key"
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {status === 'invalid' && error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function b64(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join('');
  return btoa(binary);
}

function b64url(bytes: Uint8Array): string {
  return b64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function deriveJwkThumbprint(pka: string): Promise<string> {
  const jwk = `{"crv":"Ed25519","kty":"OKP","x":"${pka}"}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jwk));
  return b64url(new Uint8Array(digest));
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
