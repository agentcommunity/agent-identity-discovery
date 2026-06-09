import type { ProtocolToken } from '@/lib/datasources/types';
import type { ProtocolGuidance } from '@/hooks/use-connection';

// Re-export for use by protocol handlers

/**
 * Agent Card structure per A2A specification
 */
export interface AgentCard {
  name: string;
  description?: string;
  url: string;
  provider?: { organization: string; url?: string };
  skills?: Array<{ id: string; name: string; description?: string }>;
  authentication?: { schemes: string[]; credentials?: string };
}

/**
 * Result of a protocol handler operation
 */
export interface ProtocolResult {
  success: boolean;
  proto: ProtocolToken;
  // For MCP: connection data
  data?: {
    protocolVersion: string;
    serverInfo: { name: string; version: string };
    capabilities: Array<{ id: string; type: 'tool' | 'resource' }>;
    security?: {
      dnssec?: boolean;
      pka?: {
        present: boolean;
        attempted: boolean;
        verified: boolean | null;
        keyid: string | null;
      };
      tls?: { checked: boolean; valid: boolean | null; daysRemaining: number | null };
      warnings?: Array<{ code: string; message: string }>;
      errors?: Array<{ code: string; message: string }>;
    };
  };
  // For A2A: agent card
  agentCard?: AgentCard;
  // For other protocols: guidance
  guidance?: ProtocolGuidance;
  // Security info (available for all protocols)
  security?: {
    dnssec?: boolean;
    pka?: { present: boolean; attempted: boolean; verified: boolean | null; keyid: string | null };
    tls?: { checked: boolean; valid: boolean | null; daysRemaining: number | null };
    warnings?: Array<{ code: string; message: string }>;
    errors?: Array<{ code: string; message: string }>;
  };
  // Auth error info
  needsAuth?: boolean;
  compliantAuth?: boolean;
  metadataUri?: string;
  metadata?: unknown;
  error?: string;
}

/**
 * Options passed to protocol handlers
 */
export interface ProtocolHandlerOptions {
  uri: string;
  proto: ProtocolToken;
  auth?: {
    bearer?: string;
    basic?: string;
    apikey?: string;
  };
}

/**
 * Protocol handler interface
 */
export interface ProtocolHandler {
  /** Protocol token this handler supports */
  token: ProtocolToken;
  /** Whether this protocol supports direct connection testing */
  canConnect: boolean;
  /** Handle the protocol connection/guidance */
  handle(options: ProtocolHandlerOptions): Promise<ProtocolResult>;
}

export { type ProtocolToken } from '@/lib/datasources/types';
export { type ProtocolGuidance } from '@/hooks/use-connection';
