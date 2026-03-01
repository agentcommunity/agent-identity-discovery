import type { ScenarioManifest } from '@/lib/tool-manifest-types';
import type { DiscoveryData, DiscoveryResult } from '@/hooks/use-discovery';
import type { HandshakeResult } from '@/hooks/use-connection';

const record: DiscoveryData = {
  v: 'aid1',
  uri: 'docker:my-agent:latest',
  proto: 'local',
  host: 'local-docker.agentcommunity.org',
  port: 0,
  desc: 'Local Docker Agent',
};

const discoveryOk: DiscoveryResult = {
  ok: true,
  value: {
    record,
    metadata: {
      dnsQuery: 'local-docker.agentcommunity.org',
      lookupTime: 8,
      recordType: 'TXT',
      source: 'DNS',
      txtRecord: 'v=aid1;u=docker:my-agent:latest;p=local;s=Local Docker Agent',
    },
  },
};

const handshakeOk: HandshakeResult = {
  ok: true,
  value: {
    protocolVersion: '2024-11-05',
    serverInfo: { name: 'Local Docker MCP', version: '1.0.0' },
    capabilities: [
      { id: 'list_containers', type: 'tool' },
      { id: 'run_command', type: 'tool' },
      { id: 'get_logs', type: 'tool' },
    ],
  },
};

export const localDockerScenario: ScenarioManifest = {
  id: 'local-docker',
  label: 'Local Docker',
  icon: '🐳',
  narrative1: 'Checking for a local agent manifest at {domain}…',
  narrative2: "Found it! The record points to a local Docker agent: '{uri}'. Connecting…",
  narrative3: 'Connected to the local agent. It offers {capCount} tools.',
  discovery: discoveryOk,
  handshake: handshakeOk,
};
