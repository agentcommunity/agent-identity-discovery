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
    title: 'Local Docker',
    label: 'Local Docker',
    domain: 'local-docker.agentcommunity.org',
    icon: '🐳',
    content: 'v=aid1;u=docker:myimage;p=local;s=Local Docker Agent',
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
    title: 'Multi String',
    label: 'Multi String',
    domain: 'multi-string.agentcommunity.org',
    icon: '📄',
    content: 'v=aid1;u=https://api.example.com/mcp;p=mcp;s=Multi string part 1',
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
    title: 'Secure',
    label: 'Secure',
    domain: 'secure.agentcommunity.org',
    icon: '🔒',
    content:
      'v=aid1;u=https://api.secure.agentcommunity.org/mcp;p=mcp;a=pat;d=https://docs.agentcommunity.org/secure;s=Secure MCP with Auth',
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
    title: 'Auth0',
    label: 'Auth0',
    domain: 'auth0.agentcommunity.org',
    icon: '/icons/auth0.svg',
    content:
      'v=aid1;u=https://ai.auth0.com/mcp;p=mcp;a=pat;d=https://auth0.com/docs/get-started/auth0-mcp-server;s=Auth0 MCP (Mock Service)',
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
    title: 'Playwright',
    label: 'Playwright',
    domain: 'playwright.agentcommunity.org',
    icon: '/icons/playwright.svg',
    content:
      'v=aid1;u=https://api.playwright.dev;p=openapi;d=https://github.com/microsoft/playwright-mcp;s=Playwright OpenAPI (Mock Service)',
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
    title: 'Ucp Showcase',
    label: 'Ucp Showcase',
    domain: 'ucp.agentcommunity.org',
    icon: '🛒',
    content:
      'v=aid1;u=https://ucp.agentcommunity.org/ucp;p=ucp;d=https://www.universalcommerce.io/;s=UCP Commerce Showcase',
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
    title: 'Grpc Showcase',
    label: 'Grpc Showcase',
    domain: 'grpc.agentcommunity.org',
    icon: '⚡',
    content:
      'v=aid1;u=grpc://grpc.agentcommunity.org:443;p=grpc;d=https://grpc.io/;s=gRPC Agent Showcase',
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
    title: 'Deprecated',
    label: 'Deprecated',
    domain: 'deprecated.agentcommunity.org',
    icon: '⚠️',
    content:
      'v=aid1;u=https://api.deprecated.agentcommunity.org/mcp;p=mcp;a=pat;e=2025-12-31T23:59:59Z;d=https://docs.agentcommunity.org/migration;s=Deprecated - migrate soon',
    category: 'error_cases',
  },
];
