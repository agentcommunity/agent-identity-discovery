import { discover } from '@agentcommunity/aid/browser';
import type { DiscoveryResult } from '@/hooks/use-discovery';
import { buildPkaMetadata } from '@/hooks/use-discovery';
import type { HandshakeResult, HandshakeSuccessData } from '@/hooks/use-connection';
import type { Datasource, HandshakeOptions } from './types';

/**
 * Concrete datasource that executes real network operations.
 */
export class LiveDatasource implements Datasource {
  async discover(domain: string): Promise<DiscoveryResult> {
    const startTime = Date.now();
    try {
      const libResult = await discover(domain);
      const lookupTime = Date.now() - startTime;

      const record = libResult.record;
      const resultUri = new URL(record.uri);
      const reconstructedTxt = Object.entries(libResult.record)
        .map(([k, v]) => k + '=' + (v as string))
        .join(';');

      const ok: DiscoveryResult = {
        ok: true,
        value: {
          record: {
            ...record,
            host: resultUri.hostname,
            port: resultUri.port ? Number.parseInt(resultUri.port, 10) : 443,
          },
          metadata: {
            dnsQuery: libResult.queryName,
            lookupTime,
            recordType: 'TXT',
            source: 'DNS-over-HTTPS',
            txtRecord: reconstructedTxt,
            pka: record.pka
              ? buildPkaMetadata(record as Parameters<typeof buildPkaMetadata>[0], libResult)
              : undefined,
          },
        },
      };

      return ok;
    } catch (error_) {
      const error: Error = error_ instanceof Error ? error_ : new Error('Unknown discovery error');
      const fail: DiscoveryResult = { ok: false, error };
      return fail;
    }
  }

  async handshake(uri: string, options: HandshakeOptions = {}): Promise<HandshakeResult> {
    const { authBearer, proto, authHint } = options;
    try {
      const response = await fetch('/api/handshake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uri,
          ...(proto ? { proto } : {}),
          ...(authBearer ? { auth: { bearer: authBearer } } : {}),
          ...(authHint ? { authHint } : {}),
        }),
      });

      const json = (await response.json()) as unknown;
      const raw = json as {
        success: boolean;
        proto?: string;
        needsAuth?: boolean;
        compliantAuth?: boolean;
        metadataUri?: string;
        metadata?: unknown;
        authType?: string;
        data?: HandshakeSuccessData;
        agentCard?: {
          name: string;
          description?: string;
          url: string;
          provider?: { organization: string; url?: string };
          skills?: Array<{ id: string; name: string; description?: string }>;
          authentication?: { schemes: string[]; credentials?: string };
        };
        guidance?: {
          canConnect: false;
          title: string;
          description: string;
          command?: string;
          docsUrl?: string;
          nextSteps: string[];
        };
        security?: Record<string, unknown>;
        error?: string;
      };

      // Handle guidance response for non-MCP protocols
      if (raw.success && raw.guidance) {
        return {
          ok: true,
          value: {
            protocolVersion: 'N/A',
            serverInfo: { name: raw.guidance.title, version: '1.0.0' },
            capabilities: [],
            guidance: raw.guidance,
            agentCard: raw.agentCard,
            security: raw.security as HandshakeSuccessData['security'],
          },
        };
      }

      if (raw.success && raw.data) {
        return { ok: true, value: raw.data };
      }

      if (raw.needsAuth) {
        const connectionModule = await import('@/hooks/use-connection');
        return {
          ok: false,
          error: new connectionModule.AuthRequiredError(
            'Authentication required',
            raw.compliantAuth,
            raw.metadataUri,
            raw.metadata,
            raw.authType as
              | 'local_cli'
              | 'pat'
              | 'oauth2_device'
              | 'oauth2_code'
              | 'compliant'
              | 'generic'
              | undefined,
          ),
        } as HandshakeResult;
      }

      return { ok: false, error: new Error(raw.error || 'Handshake failed') };
    } catch (error_) {
      const error: Error = error_ instanceof Error ? error_ : new Error('Network request failed');
      return { ok: false, error };
    }
  }
}
