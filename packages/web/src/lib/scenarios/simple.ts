import type { ScenarioManifest } from '@/lib/tool-manifest-types';
import type { DiscoveryData, DiscoveryResult } from '@/hooks/use-discovery';
import type { HandshakeResult } from '@/hooks/use-connection';

const discoveryOk: DiscoveryResult = {
  ok: true,
  value: {
    record: {
      v: 'aid2',
      uri: 'wss://simple.agentcommunity.org/mcp',
      proto: 'websocket',
      host: 'simple.agentcommunity.org',
      port: 443,
      desc: 'Simple demo agent',
    } as unknown as DiscoveryData,
    metadata: {
      dnsQuery: 'simple.agentcommunity.org',
      lookupTime: 89,
      recordType: 'TXT',
      source: 'DNS',
      txtRecord: 'v=aid2;u=wss://simple.agentcommunity.org/mcp;p=websocket;s=Simple demo agent',
    },
  },
};

const handshakeOk: HandshakeResult = {
  ok: true,
  value: {
    protocolVersion: '2024-11-05',
    serverInfo: { name: 'Simple Agent', version: '1.0.0' },
    capabilities: [
      { id: 'echo', type: 'tool' },
      { id: 'greet', type: 'tool' },
    ],
  },
};

export const simpleScenario: ScenarioManifest = {
  id: 'simple',
  label: 'Simple',
  icon: '🤖',
  narrative1: 'Alright, let me check {domain} for you…',
  narrative2: 'Perfect! I found the "{desc}" using the {protocol} protocol. Connecting…',
  narrative3: 'Connection established! The agent offers {capCount} capabilities.',
  discovery: discoveryOk,
  handshake: handshakeOk,
};
