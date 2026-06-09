/**
 * GENERATED FILE - DO NOT EDIT
 *
 * This file is auto-generated from protocol/examples.yml by scripts/generate-examples.ts
 * To make changes, edit the YAML file and run: pnpm gen
 */

// Auto-generated Terraform locals for AID examples
// Run 'pnpm gen' after updating protocol/examples.yml

locals {
  a2a_showcase = {
    name  = "_agent.a2a"
    value = "v=aid2;u=https://a2a.agentcommunity.org/.well-known/agent.json;p=a2a;d=https://a2aprotocol.ai/;s=A2A Protocol Showcase"
  }

  auth0 = {
    name  = "_agent.auth0"
    value = "v=aid2;u=https://ai.auth0.com/mcp;p=mcp;a=pat;d=https://auth0.com/docs/get-started/auth0-mcp-server;s=Auth0 MCP (Mock Service)"
  }

  complete = {
    name  = "_agent.complete"
    value = "v=aid2;p=mcp;u=https://api.complete.agentcommunity.org/mcp;d=https://docs.agentcommunity.org/complete;e=2026-12-31T23:59:59Z;s=Complete v2 with all features"
  }

  deprecated = {
    name  = "_agent.deprecated"
    value = "v=aid2;u=https://api.deprecated.agentcommunity.org/mcp;p=mcp;a=pat;e=2025-12-31T23:59:59Z;d=https://docs.agentcommunity.org/migration;s=Deprecated - migrate soon"
  }

  firecrawl = {
    name  = "_agent.firecrawl"
    value = "v=aid2;u=npx:firecrawl-mcp;p=local;d=https://docs.firecrawl.dev/mcp-server;s=Firecrawl Web Scraping Agent"
  }

  graphql_showcase = {
    name  = "_agent.graphql"
    value = "v=aid2;u=https://graphql.agentcommunity.org/graphql;p=graphql;d=https://graphql.org/;s=GraphQL Agent Showcase"
  }

  grpc_showcase = {
    name  = "_agent.grpc"
    value = "v=aid2;u=https://grpc.agentcommunity.org;p=grpc;d=https://grpc.io/;s=gRPC Agent Showcase"
  }

  local_docker = {
    name  = "_agent.local-docker"
    value = "v=aid2;u=docker:myimage;p=local;s=Local Docker Agent"
  }

  messy = {
    name  = "_agent.messy"
    value = " v=aid2 ; u=https://api.example.com/mcp ; p=mcp ; extra=ignored "
  }

  multi_string = {
    name  = "_agent.multi-string"
    value = "v=aid2;u=https://api.example.com/mcp;p=mcp;s=Multi string part 1"
  }

  no_server = {
    name  = "_agent.no-server"
    value = "v=aid2;u=https://does-not-exist.agentcommunity.org:1234;p=mcp;s=Offline Agent"
  }

  pka_basic = {
    name  = "_agent.pka-basic"
    value = "v=aid2;p=mcp;u=https://aid.agentcommunity.org/api/pka-demo;k=Eesj9h7MD0cRERrc_ICXu5Lb1WkokpkbWAkRcDsxUvA;s=Live PKA Demo"
  }

  playwright = {
    name  = "_agent.playwright"
    value = "v=aid2;u=https://api.playwright.dev;p=openapi;d=https://github.com/microsoft/playwright-mcp;s=Playwright OpenAPI (Mock Service)"
  }

  secure = {
    name  = "_agent.secure"
    value = "v=aid2;u=https://api.secure.agentcommunity.org/mcp;p=mcp;a=pat;d=https://docs.agentcommunity.org/secure;s=Secure MCP with Auth"
  }

  simple = {
    name  = "_agent.simple"
    value = "v=aid2;u=https://api.example.com/mcp;p=mcp;a=pat;s=Basic MCP Example"
  }

  supabase = {
    name  = "_agent.supabase"
    value = "v=aid2;u=https://api.supabase.com/mcp;p=mcp;a=pat;d=https://supabase.com/docs/guides/getting-started/mcp;s=Supabase MCP (Mock Service)"
  }

  ucp_showcase = {
    name  = "_agent.ucp"
    value = "v=aid2;u=https://ucp.agentcommunity.org/ucp;p=ucp;d=https://www.universalcommerce.io/;s=UCP Commerce Showcase"
  }

  // Combined map of all examples for easy reference
  all_examples = {
    a2a_showcase = local.a2a_showcase
    auth0 = local.auth0
    complete = local.complete
    deprecated = local.deprecated
    firecrawl = local.firecrawl
    graphql_showcase = local.graphql_showcase
    grpc_showcase = local.grpc_showcase
    local_docker = local.local_docker
    messy = local.messy
    multi_string = local.multi_string
    no_server = local.no_server
    pka_basic = local.pka_basic
    playwright = local.playwright
    secure = local.secure
    simple = local.simple
    supabase = local.supabase
    ucp_showcase = local.ucp_showcase
  }
}