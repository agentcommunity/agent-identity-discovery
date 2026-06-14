'use client';

import { useState } from 'react';
import type { Result } from '@/lib/types/result';

/** Guidance for non-MCP protocols that do not support direct connection testing */
export interface ProtocolGuidance {
  canConnect: false;
  title: string;
  description: string;
  command?: string;
  docsUrl?: string;
  nextSteps: string[];
}

/** Agent Card structure per A2A specification */
export interface AgentCard {
  name: string;
  description?: string;
  url: string;
  provider?: { organization: string; url?: string };
  skills?: Array<{ id: string; name: string; description?: string }>;
  authentication?: { schemes: string[]; credentials?: string };
}

export interface HandshakeSuccessData {
  protocolVersion: string;
  serverInfo: { name: string; version: string };
  capabilities: { id: string; type: 'tool' | 'resource' }[];
  /** Present for non-MCP protocols - provides user guidance instead of connection */
  guidance?: ProtocolGuidance;
  /** Present for A2A protocols - contains the agent card data */
  agentCard?: AgentCard;
  security?: {
    dnssec?: boolean;
    pka?: {
      present: boolean;
      attempted: boolean;
      verified: boolean | null;
      keyid: string | null;
      domainBound?: boolean;
    };
    tls?: { checked: boolean; valid: boolean | null; daysRemaining: number | null };
    warnings?: Array<{ code: string; message: string }>;
    errors?: Array<{ code: string; message: string }>;
  };
}

/**
 * Custom error used when the handshake indicates authentication is required.
 */
export class AuthRequiredError extends Error {
  readonly needsAuth = true;
  constructor(
    message: string,
    public readonly compliantAuth?: boolean,
    public readonly metadataUri?: string,
    public readonly metadata?: unknown,
    public readonly authType?:
      | 'local_cli'
      | 'pat'
      | 'oauth2_device'
      | 'oauth2_code'
      | 'compliant'
      | 'generic',
  ) {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export type HandshakeResult = Result<HandshakeSuccessData, Error | AuthRequiredError>;

// TEMPORARY alias for incremental migration.
export type LegacyHandshakeResult = HandshakeResult;

interface ExecuteOptions {
  /** Bearer token for authenticated handshake */
  auth?: { bearer: string };
}

/**
 * React hook for performing an AID handshake against the local API route.
 * Handles optional mock data, authentication, and automatic metadata fetch.
 */
export function useConnection() {
  const [status, setStatus] = useState<'pending' | 'running' | 'success' | 'error'>('pending');
  const [result, setResult] = useState<HandshakeResult | null>(null);

  const execute = async (uri: string, options?: ExecuteOptions): Promise<HandshakeResult> => {
    setStatus('running');
    try {
      const response = await fetch('/api/handshake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri, ...(options?.auth ? { auth: options.auth } : {}) }),
      });

      const raw = (await response.json()) as {
        success: boolean;
        needsAuth?: boolean;
        compliantAuth?: boolean;
        metadataUri?: string;
        metadata?: unknown;
        data?: HandshakeSuccessData;
        error?: string;
      };

      if (raw.success && raw.data) {
        const okResult: HandshakeResult = { ok: true, value: raw.data };
        setResult(okResult);
        setStatus('success');
        return okResult;
      }

      if (raw.needsAuth) {
        const authErr = new AuthRequiredError(
          'Authentication required',
          raw.compliantAuth,
          raw.metadataUri,
          raw.metadata,
        );
        const errResult: HandshakeResult = { ok: false, error: authErr };
        setResult(errResult);
        setStatus('error');
        return errResult;
      }

      const genericErr = new Error(raw.error || 'Handshake failed');
      const errResult: HandshakeResult = { ok: false, error: genericErr };
      setResult(errResult);
      setStatus('error');
      return errResult;
    } catch (error) {
      const err: Error = error instanceof Error ? error : new Error('Network request failed');
      const errorResult: HandshakeResult = { ok: false, error: err };
      setResult(errorResult);
      setStatus('error');
      return errorResult;
    }
  };

  return { status, result, execute } as const;
}
