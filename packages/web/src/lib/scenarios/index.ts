import { simpleScenario } from './simple';
import { supabaseScenario } from './supabase';
import { localDockerScenario } from './local-docker';
import type { ScenarioManifest } from '@/lib/tool-manifest-types';
import type { DiscoveryResult } from '@/hooks/use-discovery';
import type { HandshakeResult } from '@/hooks/use-connection';

// Helper builders for common failure cases
const discoveryFail = (domain: string): DiscoveryResult => ({
  ok: false,
  error: new Error(`No _agent TXT record found for ${domain}`),
});
const handshakeFail = (msg: string): HandshakeResult => ({ ok: false, error: new Error(msg) });

export const scenarios: Record<string, ScenarioManifest> = {
  'simple.agentcommunity.org': simpleScenario,
  'supabase.agentcommunity.org': { ...supabaseScenario, live: true },
  'local-docker.agentcommunity.org': localDockerScenario,

  // ---- Additional demo scenarios (minimal) ------------------------------
  'auth0.agentcommunity.org': {
    id: 'auth0',
    label: 'Auth0',
    icon: '🔐',
    narrative1: 'Let me investigate {domain} for identity services…',
    narrative2: 'Discovery failed: **{error}**',
    discovery: discoveryFail('auth0.agentcommunity.org'),
    handshake: handshakeFail('Connection not attempted – discovery failed.'),
    live: true,
  },

  'messy.agentcommunity.org': {
    id: 'messy',
    label: 'Messy',
    icon: '🤖',
    narrative1: 'Hmm, {domain} looks interesting…',
    narrative2: "Found a chaotic agent '{desc}'. Connecting…",
    narrative3: 'Connection worked! {capCount} experimental tools available.',
    discovery: {
      ok: true,
      value: {
        record: {
          v: 'aid2',
          uri: 'https://messy.agentcommunity.org/mcp',
          proto: 'mcp',
          host: 'messy.agentcommunity.org',
          port: 443,
          desc: 'Chaotic experimental agent',
        } as unknown as import('@/hooks/use-discovery').DiscoveryData,
        metadata: {
          dnsQuery: 'messy.agentcommunity.org',
          lookupTime: 100,
          recordType: 'TXT',
          source: 'DNS',
          txtRecord:
            ' v=aid2 ; u=https://messy.agentcommunity.org/mcp ; p=mcp ; s=Chaotic experimental agent ',
        },
      },
    },
    handshake: {
      ok: true,
      value: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'Chaos Agent', version: '0.1.0' },
        capabilities: [
          { id: 'random_chaos', type: 'tool' },
          { id: 'break_things', type: 'tool' },
        ],
      },
    },
  },

  'firecrawl.agentcommunity.org': {
    id: 'firecrawl',
    label: 'Firecrawl',
    icon: '🔥',
    narrative1: 'Connecting to Firecrawl…',
    narrative2: 'Server ready, connecting…',
    narrative3: 'Connected! Web scraping tools available.',
    discovery: {
      ok: true,
      value: {
        record: {
          v: 'aid2',
          uri: 'npx:firecrawl-mcp',
          proto: 'local',
          host: 'firecrawl-mcp',
          port: 0,
          desc: 'Firecrawl Agent',
        } as unknown as import('@/hooks/use-discovery').DiscoveryData,
        metadata: {
          dnsQuery: 'firecrawl.agentcommunity.org',
          lookupTime: 50,
          recordType: 'TXT',
          source: 'DNS',
          txtRecord:
            'v=aid2;u=npx:firecrawl-mcp;p=local;d=https://docs.firecrawl.dev/mcp-server;s=Firecrawl Agent',
        },
      },
    },
    handshake: {
      ok: true,
      value: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'Firecrawl', version: '1.0.0' },
        capabilities: [{ id: 'firecrawl_scrape', type: 'tool' }],
      },
    },
    live: true,
  },

  'playwright.agentcommunity.org': {
    id: 'playwright',
    label: 'Playwright',
    icon: '🎭',
    narrative1: 'Inspecting {domain} for browser automation agent…',
    narrative2: 'Found agent, connecting…',
    narrative3: 'Connected and ready!',
    discovery: {
      ok: true,
      value: {
        record: {
          v: 'aid2',
          uri: 'https://api.playwright.dev/mcp',
          proto: 'openapi',
          host: 'api.playwright.dev',
          port: 443,
          desc: 'Playwright Agent',
        } as unknown as import('@/hooks/use-discovery').DiscoveryData,
        metadata: {
          dnsQuery: 'playwright.agentcommunity.org',
          lookupTime: 60,
          recordType: 'TXT',
          source: 'DNS',
          txtRecord:
            'v=aid2;u=https://api.playwright.dev/mcp;p=openapi;d=https://github.com/microsoft/playwright-mcp;s=Playwright Agent',
        },
      },
    },
    handshake: {
      ok: true,
      value: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'Playwright', version: '1.0.0' },
        capabilities: [{ id: 'browser_click', type: 'tool' }],
      },
    },
    live: true,
  },

  'multi-string.agentcommunity.org': {
    id: 'multi-string',
    label: 'Multi-String',
    icon: '📄',
    narrative1: 'Querying {domain} (split TXT records)…',
    narrative2: 'Resolver joined records, connecting…',
    narrative3: 'Connected with {capCount} string tools.',
    discovery: {
      ok: true,
      value: {
        record: {
          v: 'aid2',
          uri: 'https://multi-string.agentcommunity.org/mcp',
          proto: 'mcp',
          host: 'multi-string.agentcommunity.org',
          port: 443,
          desc: 'Agent from multiple TXT records',
        } as unknown as import('@/hooks/use-discovery').DiscoveryData,
        metadata: {
          dnsQuery: 'multi-string.agentcommunity.org',
          lookupTime: 140,
          recordType: 'TXT',
          source: 'DNS',
          txtRecord:
            'v=aid2;u=https://multi-string.agentcommunity.org/mcp;p=mcp;s=Agent from multiple TXT records',
        },
      },
    },
    handshake: {
      ok: true,
      value: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'String Agent', version: '3.2.1' },
        capabilities: [{ id: 'concat_strings', type: 'tool' }],
      },
    },
  },

  'no-server.agentcommunity.org': {
    id: 'no-server',
    label: 'Offline Agent',
    icon: '👻',
    narrative1: 'Checking {domain} (should be offline)…',
    narrative2: 'Discovery succeeded, attempting connection…',
    narrative3: 'Connection failed as expected.',
    discovery: {
      ok: true,
      value: {
        record: {
          v: 'aid2',
          uri: 'https://does-not-exist.agentcommunity.org:1234',
          proto: 'mcp',
          host: 'does-not-exist.agentcommunity.org',
          port: 1234,
          desc: 'Offline Agent',
        } as unknown as import('@/hooks/use-discovery').DiscoveryData,
        metadata: {
          dnsQuery: 'no-server.agentcommunity.org',
          lookupTime: 95,
          recordType: 'TXT',
          source: 'DNS',
          txtRecord:
            'v=aid2;u=https://does-not-exist.agentcommunity.org:1234;p=mcp;s=Offline Agent',
        },
      },
    },
    handshake: handshakeFail('Connection refused by server.'),
  },

  'live-unsupported': {
    id: 'live-unsupported',
    label: 'Live Domain',
    icon: '🌐',
    narrative1: 'Looking up {domain} for an agent record…',
    narrative2: 'Discovery failed: **{error}**',
    discovery: discoveryFail('live-unsupported'),
    handshake: handshakeFail('Connection not attempted – discovery failed.'),
  },

  'default-failure': {
    id: 'default-failure',
    label: 'Failure',
    icon: '❌',
    narrative1: 'Let me check {domain}…',
    narrative2: 'No agent found. Discovery failed: **{error}**',
    discovery: discoveryFail('default-failure'),
    handshake: handshakeFail('Connection not attempted – discovery failed.'),
  },
};
