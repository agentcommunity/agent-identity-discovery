/**
 * GENERATED FILE - DO NOT EDIT
 *
 * This file is auto-generated from protocol/examples.yml by scripts/generate-examples.ts
 * To make changes, edit the YAML file and run: pnpm gen
 */

import { type ComponentType } from 'react';

// Define the props we expect our icon components to accept.
interface IconProps {
  className?: string;
}

// A type that can be a string (for paths/emojis) or a React component that accepts IconProps.
export type ExampleIcon = string | ComponentType<IconProps>;

export interface Example {
  title: string;
  label?: string;
  icon: ExampleIcon;
  content: string;
  domain: string;
  category: string;
}

export const TUTORIAL_EXAMPLES: Example[] = [
  {
    title: 'Simple',
    label: 'Simple',
    domain: 'simple.agentcommunity.org',
    icon: '🤖',
    content: 'v=aid1;u=https://api.example.com/mcp;p=mcp;a=pat;s=Basic MCP Example',
    category: 'tutorials',
  },
  {
    title: 'V2 Simple',
    label: 'V2 Simple',
    domain: 'v2-simple.agentcommunity.org',
    icon: '🤖',
    content: 'v=aid2;u=https://api.example.com/mcp;p=mcp;a=pat;s=Basic MCP Example',
    category: 'tutorials',
  },
  {
    title: 'Local Docker',
    label: 'Local Docker',
    domain: 'local-docker.agentcommunity.org',
    icon: '🐳',
    content: 'v=aid1;u=docker:myimage;p=local;s=Local Docker Agent',
    category: 'tutorials',
  },
  {
    title: 'V2 Local Docker',
    label: 'V2 Local Docker',
    domain: 'v2-local-docker.agentcommunity.org',
    icon: '🐳',
    content: 'v=aid2;u=docker:myimage;p=local;s=Local Docker Agent',
    category: 'tutorials',
  },
  {
    title: 'Messy',
    label: 'Messy',
    domain: 'messy.agentcommunity.org',
    icon: '🧹',
    content: ' v=aid1 ; u=https://api.example.com/mcp ; p=mcp ; extra=ignored ',
    category: 'tutorials',
  },
  {
    title: 'V2 Messy',
    label: 'V2 Messy',
    domain: 'v2-messy.agentcommunity.org',
    icon: '🧹',
    content: ' v=aid2 ; u=https://api.example.com/mcp ; p=mcp ; extra=ignored ',
    category: 'tutorials',
  },
  {
    title: 'Multi String',
    label: 'Multi String',
    domain: 'multi-string.agentcommunity.org',
    icon: '📄',
    content: 'v=aid1;u=https://api.example.com/mcp;p=mcp;s=Multi string part 1',
    category: 'tutorials',
  },
  {
    title: 'V2 Multi String',
    label: 'V2 Multi String',
    domain: 'v2-multi-string.agentcommunity.org',
    icon: '📄',
    content: 'v=aid2;u=https://api.example.com/mcp;p=mcp;s=Multi string part 1',
    category: 'tutorials',
  },
  {
    title: 'Pka Basic',
    label: 'Pka Basic',
    domain: 'pka-basic.agentcommunity.org',
    icon: '🔐',
    content:
      'v=aid1;p=mcp;u=https://aid.agentcommunity.org/api/pka-demo;k=z2Cwtdw9EZzy1Mhv8ZmGRoMJPkJcU3amQQhpUJx35pKUs;i=p1;s=Live PKA Demo',
    category: 'tutorials',
  },
  {
    title: 'V2 Pka Basic',
    label: 'V2 Pka Basic',
    domain: 'v2-pka-basic.agentcommunity.org',
    icon: '🔐',
    content:
      'v=aid2;p=mcp;u=https://aid.agentcommunity.org/api/pka-demo;k=Eesj9h7MD0cRERrc_ICXu5Lb1WkokpkbWAkRcDsxUvA;s=Live PKA Demo',
    category: 'tutorials',
  },
];

export const REFERENCE_EXAMPLES: Example[] = [
  {
    title: 'Complete V1 2',
    label: 'Complete V1 2',
    domain: 'complete.agentcommunity.org',
    icon: '✨',
    content:
      'v=aid1;p=mcp;u=https://api.complete.agentcommunity.org/mcp;d=https://docs.agentcommunity.org/complete;e=2026-12-31T23:59:59Z;s=Complete v1.2 with all features',
    category: 'reference',
  },
  {
    title: 'V2 Complete',
    label: 'V2 Complete',
    domain: 'v2-complete.agentcommunity.org',
    icon: '✨',
    content:
      'v=aid2;p=mcp;u=https://api.complete.agentcommunity.org/mcp;d=https://docs.agentcommunity.org/complete;e=2026-12-31T23:59:59Z;s=Complete v2 with all features',
    category: 'reference',
  },
  {
    title: 'Secure',
    label: 'Secure',
    domain: 'secure.agentcommunity.org',
    icon: '🔒',
    content:
      'v=aid1;u=https://api.secure.agentcommunity.org/mcp;p=mcp;a=pat;d=https://docs.agentcommunity.org/secure;s=Secure MCP with Auth',
    category: 'reference',
  },
  {
    title: 'V2 Secure',
    label: 'V2 Secure',
    domain: 'v2-secure.agentcommunity.org',
    icon: '🔒',
    content:
      'v=aid2;u=https://api.secure.agentcommunity.org/mcp;p=mcp;a=pat;d=https://docs.agentcommunity.org/secure;s=Secure MCP with Auth',
    category: 'reference',
  },
];

export const REAL_WORLD_EXAMPLES: Example[] = [
  {
    title: 'Supabase',
    label: 'Supabase',
    domain: 'supabase.agentcommunity.org',
    icon: '/icons/supabase.svg',
    content:
      'v=aid1;u=https://api.supabase.com/mcp;p=mcp;a=pat;d=https://supabase.com/docs/guides/getting-started/mcp;s=Supabase MCP (Mock Service)',
    category: 'real_world',
  },
  {
    title: 'V2 Supabase',
    label: 'V2 Supabase',
    domain: 'v2-supabase.agentcommunity.org',
    icon: '/icons/supabase.svg',
    content:
      'v=aid2;u=https://api.supabase.com/mcp;p=mcp;a=pat;d=https://supabase.com/docs/guides/getting-started/mcp;s=Supabase MCP (Mock Service)',
    category: 'real_world',
  },
  {
    title: 'Auth0',
    label: 'Auth0',
    domain: 'auth0.agentcommunity.org',
    icon: '/icons/auth0.svg',
    content:
      'v=aid1;u=https://ai.auth0.com/mcp;p=mcp;a=pat;d=https://auth0.com/docs/get-started/auth0-mcp-server;s=Auth0 MCP (Mock Service)',
    category: 'real_world',
  },
  {
    title: 'V2 Auth0',
    label: 'V2 Auth0',
    domain: 'v2-auth0.agentcommunity.org',
    icon: '/icons/auth0.svg',
    content:
      'v=aid2;u=https://ai.auth0.com/mcp;p=mcp;a=pat;d=https://auth0.com/docs/get-started/auth0-mcp-server;s=Auth0 MCP (Mock Service)',
    category: 'real_world',
  },
  {
    title: 'Firecrawl',
    label: 'Firecrawl',
    domain: 'firecrawl.agentcommunity.org',
    icon: '🔥',
    content:
      'v=aid1;u=npx:firecrawl-mcp;p=local;d=https://docs.firecrawl.dev/mcp-server;s=Firecrawl Web Scraping Agent',
    category: 'real_world',
  },
  {
    title: 'V2 Firecrawl',
    label: 'V2 Firecrawl',
    domain: 'v2-firecrawl.agentcommunity.org',
    icon: '🔥',
    content:
      'v=aid2;u=npx:firecrawl-mcp;p=local;d=https://docs.firecrawl.dev/mcp-server;s=Firecrawl Web Scraping Agent',
    category: 'real_world',
  },
  {
    title: 'Playwright',
    label: 'Playwright',
    domain: 'playwright.agentcommunity.org',
    icon: '/icons/playwright.svg',
    content:
      'v=aid1;u=https://api.playwright.dev;p=openapi;d=https://github.com/microsoft/playwright-mcp;s=Playwright OpenAPI (Mock Service)',
    category: 'real_world',
  },
  {
    title: 'V2 Playwright',
    label: 'V2 Playwright',
    domain: 'v2-playwright.agentcommunity.org',
    icon: '/icons/playwright.svg',
    content:
      'v=aid2;u=https://api.playwright.dev;p=openapi;d=https://github.com/microsoft/playwright-mcp;s=Playwright OpenAPI (Mock Service)',
    category: 'real_world',
  },
];

export const PROTOCOL_EXAMPLES: Example[] = [
  {
    title: 'A2a Showcase',
    label: 'A2a Showcase',
    domain: 'a2a.agentcommunity.org',
    icon: '🤝',
    content:
      'v=aid1;u=https://a2a.agentcommunity.org/.well-known/agent.json;p=a2a;d=https://a2aprotocol.ai/;s=A2A Protocol Showcase',
    category: 'protocols',
  },
  {
    title: 'V2 A2a Showcase',
    label: 'V2 A2a Showcase',
    domain: 'v2-a2a.agentcommunity.org',
    icon: '🤝',
    content:
      'v=aid2;u=https://a2a.agentcommunity.org/.well-known/agent.json;p=a2a;d=https://a2aprotocol.ai/;s=A2A Protocol Showcase',
    category: 'protocols',
  },
  {
    title: 'Ucp Showcase',
    label: 'Ucp Showcase',
    domain: 'ucp.agentcommunity.org',
    icon: '🛒',
    content:
      'v=aid1;u=https://ucp.agentcommunity.org/ucp;p=ucp;d=https://www.universalcommerce.io/;s=UCP Commerce Showcase',
    category: 'protocols',
  },
  {
    title: 'V2 Ucp Showcase',
    label: 'V2 Ucp Showcase',
    domain: 'v2-ucp.agentcommunity.org',
    icon: '🛒',
    content:
      'v=aid2;u=https://ucp.agentcommunity.org/ucp;p=ucp;d=https://www.universalcommerce.io/;s=UCP Commerce Showcase',
    category: 'protocols',
  },
  {
    title: 'Graphql Showcase',
    label: 'Graphql Showcase',
    domain: 'graphql.agentcommunity.org',
    icon: '◇',
    content:
      'v=aid1;u=https://graphql.agentcommunity.org/graphql;p=graphql;d=https://graphql.org/;s=GraphQL Agent Showcase',
    category: 'protocols',
  },
  {
    title: 'V2 Graphql Showcase',
    label: 'V2 Graphql Showcase',
    domain: 'v2-graphql.agentcommunity.org',
    icon: '◇',
    content:
      'v=aid2;u=https://graphql.agentcommunity.org/graphql;p=graphql;d=https://graphql.org/;s=GraphQL Agent Showcase',
    category: 'protocols',
  },
  {
    title: 'Grpc Showcase',
    label: 'Grpc Showcase',
    domain: 'grpc.agentcommunity.org',
    icon: '⚡',
    content:
      'v=aid1;u=https://grpc.agentcommunity.org;p=grpc;d=https://grpc.io/;s=gRPC Agent Showcase',
    category: 'protocols',
  },
  {
    title: 'V2 Grpc Showcase',
    label: 'V2 Grpc Showcase',
    domain: 'v2-grpc.agentcommunity.org',
    icon: '⚡',
    content:
      'v=aid2;u=https://grpc.agentcommunity.org;p=grpc;d=https://grpc.io/;s=gRPC Agent Showcase',
    category: 'protocols',
  },
];

export const OTHER_CHAT_EXAMPLES: Example[] = [
  {
    title: 'No Server',
    label: 'No Server',
    domain: 'no-server.agentcommunity.org',
    icon: '❌',
    content: 'v=aid1;u=https://does-not-exist.agentcommunity.org:1234;p=mcp;s=Offline Agent',
    category: 'error_cases',
  },
  {
    title: 'V2 No Server',
    label: 'V2 No Server',
    domain: 'v2-no-server.agentcommunity.org',
    icon: '❌',
    content: 'v=aid2;u=https://does-not-exist.agentcommunity.org:1234;p=mcp;s=Offline Agent',
    category: 'error_cases',
  },
  {
    title: 'Deprecated',
    label: 'Deprecated',
    domain: 'deprecated.agentcommunity.org',
    icon: '⚠️',
    content:
      'v=aid1;u=https://api.deprecated.agentcommunity.org/mcp;p=mcp;a=pat;e=2025-12-31T23:59:59Z;d=https://docs.agentcommunity.org/migration;s=Deprecated - migrate soon',
    category: 'error_cases',
  },
  {
    title: 'V2 Deprecated',
    label: 'V2 Deprecated',
    domain: 'v2-deprecated.agentcommunity.org',
    icon: '⚠️',
    content:
      'v=aid2;u=https://api.deprecated.agentcommunity.org/mcp;p=mcp;a=pat;e=2025-12-31T23:59:59Z;d=https://docs.agentcommunity.org/migration;s=Deprecated - migrate soon',
    category: 'error_cases',
  },
];
