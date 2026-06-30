import React, { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { ConnectionToolBlock } from '@/components/workbench/blocks/connection-block';
import type { DiscoveryResult } from '@/hooks/use-discovery';
import type { HandshakeResult } from '@/hooks/use-connection';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const discoveryResult: DiscoveryResult = {
  ok: true,
  value: {
    record: {
      v: 'aid2',
      uri: 'https://api.vendor.example/mcp',
      proto: 'mcp',
      host: 'api.vendor.example',
      port: 443,
    },
    metadata: {
      dnsQuery: '_agent.example.com',
      lookupTime: 25,
      recordType: 'TXT',
      source: 'DNS-over-HTTPS',
    },
  },
};

const handshakeResult: HandshakeResult = {
  ok: true,
  value: {
    protocolVersion: '2024-11-05',
    serverInfo: { name: 'Vendor MCP', version: '1.0.0' },
    capabilities: [],
    security: {
      pka: {
        present: true,
        attempted: true,
        verified: true,
        keyid: 'abc123',
        domainBound: true,
      },
    },
  },
};

describe('ConnectionToolBlock', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = null;
    container = null;
  });

  it('labels connection-stage binding as endpoint-bound', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ConnectionToolBlock
          status="success"
          result={handshakeResult}
          discoveryResult={discoveryResult}
        />,
      );
    });

    expect(container.textContent).toContain('Endpoint-bound');
    expect(container.textContent).not.toContain('domain-bound');
  });
});
