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
