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
    value = "v=aid1;u=https://a2a.agentcommunity.org/.well-known/agent.json;p=a2a;d=https://a2aprotocol.ai/;s=A2A Protocol Showcase"
  }

  auth0 = {
    name  = "_agent.auth0"
    value = "v=aid1;u=https://ai.auth0.com/mcp;p=mcp;a=pat;d=https://auth0.com/docs/get-started/auth0-mcp-server;s=Auth0 MCP (Mock Service)"
  }

  complete_v1_2 = {
    name  = "_agent.complete"
    value = "v=aid1;p=mcp;u=https://api.complete.agentcommunity.org/mcp;d=https://docs.agentcommunity.org/complete;e=2026-12-31T23:59:59Z;s=Complete v1.2 with all features"
  }

  deprecated = {
    name  = "_agent.deprecated"
    value = "v=aid1;u=https://api.deprecated.agentcommunity.org/mcp;p=mcp;a=pat;e=2025-12-31T23:59:59Z;d=https://docs.agentcommunity.org/migration;s=Deprecated - migrate soon"
  }

  firecrawl = {
    name  = "_agent.firecrawl"
    value = "v=aid1;u=npx:firecrawl-mcp;p=local;d=https://docs.firecrawl.dev/mcp-server;s=Firecrawl Web Scraping Agent"
  }

  graphql_showcase = {
    name  = "_agent.graphql"
    value = "v=aid1;u=https://graphql.agentcommunity.org/graphql;p=graphql;d=https://graphql.org/;s=GraphQL Agent Showcase"
  }

  grpc_showcase = {
    name  = "_agent.grpc"
    value = "v=aid1;u=https://grpc.agentcommunity.org;p=grpc;d=https://grpc.io/;s=gRPC Agent Showcase"
  }

  local_docker = {
    name  = "_agent.local-docker"
    value = "v=aid1;u=docker:myimage;p=local;s=Local Docker Agent"
  }

  messy = {
    name  = "_agent.messy"
    value = " v=aid1 ; u=https://api.example.com/mcp ; p=mcp ; extra=ignored "
  }

  multi_string = {
    name  = "_agent.multi-string"
    value = "v=aid1;u=https://api.example.com/mcp;p=mcp;s=Multi string part 1"
  }

  no_server = {
    name  = "_agent.no-server"
    value = "v=aid1;u=https://does-not-exist.agentcommunity.org:1234;p=mcp;s=Offline Agent"
  }

  pka_basic = {
    name  = "_agent.pka-basic"
    value = "v=aid1;p=mcp;u=https://aid.agentcommunity.org/api/pka-demo;k=z2Cwtdw9EZzy1Mhv8ZmGRoMJPkJcU3amQQhpUJx35pKUs;i=p1;s=Live PKA Demo"
  }

  playwright = {
    name  = "_agent.playwright"
    value = "v=aid1;u=https://api.playwright.dev;p=openapi;d=https://github.com/microsoft/playwright-mcp;s=Playwright OpenAPI (Mock Service)"
  }

  secure = {
    name  = "_agent.secure"
    value = "v=aid1;u=https://api.secure.agentcommunity.org/mcp;p=mcp;a=pat;d=https://docs.agentcommunity.org/secure;s=Secure MCP with Auth"
  }

  simple = {
    name  = "_agent.simple"
    value = "v=aid1;u=https://api.example.com/mcp;p=mcp;a=pat;s=Basic MCP Example"
  }

  supabase = {
    name  = "_agent.supabase"
    value = "v=aid1;u=https://api.supabase.com/mcp;p=mcp;a=pat;d=https://supabase.com/docs/guides/getting-started/mcp;s=Supabase MCP (Mock Service)"
  }

  ucp_showcase = {
    name  = "_agent.ucp"
    value = "v=aid1;u=https://ucp.agentcommunity.org/ucp;p=ucp;d=https://www.universalcommerce.io/;s=UCP Commerce Showcase"
  }

  v2_a2a_showcase = {
    name  = "_agent.v2-a2a"
    value = "v=aid2;u=https://a2a.agentcommunity.org/.well-known/agent.json;p=a2a;d=https://a2aprotocol.ai/;s=A2A Protocol Showcase"
  }

  v2_auth0 = {
    name  = "_agent.v2-auth0"
    value = "v=aid2;u=https://ai.auth0.com/mcp;p=mcp;a=pat;d=https://auth0.com/docs/get-started/auth0-mcp-server;s=Auth0 MCP (Mock Service)"
  }

  v2_complete = {
    name  = "_agent.v2-complete"
    value = "v=aid2;p=mcp;u=https://api.complete.agentcommunity.org/mcp;d=https://docs.agentcommunity.org/complete;e=2026-12-31T23:59:59Z;s=Complete v2 with all features"
  }

  v2_deprecated = {
    name  = "_agent.v2-deprecated"
    value = "v=aid2;u=https://api.deprecated.agentcommunity.org/mcp;p=mcp;a=pat;e=2025-12-31T23:59:59Z;d=https://docs.agentcommunity.org/migration;s=Deprecated - migrate soon"
  }

  v2_firecrawl = {
    name  = "_agent.v2-firecrawl"
    value = "v=aid2;u=npx:firecrawl-mcp;p=local;d=https://docs.firecrawl.dev/mcp-server;s=Firecrawl Web Scraping Agent"
  }

  v2_graphql_showcase = {
    name  = "_agent.v2-graphql"
    value = "v=aid2;u=https://graphql.agentcommunity.org/graphql;p=graphql;d=https://graphql.org/;s=GraphQL Agent Showcase"
  }

  v2_grpc_showcase = {
    name  = "_agent.v2-grpc"
    value = "v=aid2;u=https://grpc.agentcommunity.org;p=grpc;d=https://grpc.io/;s=gRPC Agent Showcase"
  }

  v2_local_docker = {
    name  = "_agent.v2-local-docker"
    value = "v=aid2;u=docker:myimage;p=local;s=Local Docker Agent"
  }

  v2_messy = {
    name  = "_agent.v2-messy"
    value = " v=aid2 ; u=https://api.example.com/mcp ; p=mcp ; extra=ignored "
  }

  v2_multi_string = {
    name  = "_agent.v2-multi-string"
    value = "v=aid2;u=https://api.example.com/mcp;p=mcp;s=Multi string part 1"
  }

  v2_no_server = {
    name  = "_agent.v2-no-server"
    value = "v=aid2;u=https://does-not-exist.agentcommunity.org:1234;p=mcp;s=Offline Agent"
  }

  v2_pka_basic = {
    name  = "_agent.v2-pka-basic"
    value = "v=aid2;p=mcp;u=https://aid.agentcommunity.org/api/pka-demo;k=Eesj9h7MD0cRERrc_ICXu5Lb1WkokpkbWAkRcDsxUvA;s=Live PKA Demo"
  }

  v2_playwright = {
    name  = "_agent.v2-playwright"
    value = "v=aid2;u=https://api.playwright.dev;p=openapi;d=https://github.com/microsoft/playwright-mcp;s=Playwright OpenAPI (Mock Service)"
  }

  v2_secure = {
    name  = "_agent.v2-secure"
    value = "v=aid2;u=https://api.secure.agentcommunity.org/mcp;p=mcp;a=pat;d=https://docs.agentcommunity.org/secure;s=Secure MCP with Auth"
  }

  v2_simple = {
    name  = "_agent.v2-simple"
    value = "v=aid2;u=https://api.example.com/mcp;p=mcp;a=pat;s=Basic MCP Example"
  }

  v2_supabase = {
    name  = "_agent.v2-supabase"
    value = "v=aid2;u=https://api.supabase.com/mcp;p=mcp;a=pat;d=https://supabase.com/docs/guides/getting-started/mcp;s=Supabase MCP (Mock Service)"
  }

  v2_ucp_showcase = {
    name  = "_agent.v2-ucp"
    value = "v=aid2;u=https://ucp.agentcommunity.org/ucp;p=ucp;d=https://www.universalcommerce.io/;s=UCP Commerce Showcase"
  }

  // Combined map of all examples for easy reference
  all_examples = {
    a2a_showcase = local.a2a_showcase
    auth0 = local.auth0
    complete_v1_2 = local.complete_v1_2
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
    v2_a2a_showcase = local.v2_a2a_showcase
    v2_auth0 = local.v2_auth0
    v2_complete = local.v2_complete
    v2_deprecated = local.v2_deprecated
    v2_firecrawl = local.v2_firecrawl
    v2_graphql_showcase = local.v2_graphql_showcase
    v2_grpc_showcase = local.v2_grpc_showcase
    v2_local_docker = local.v2_local_docker
    v2_messy = local.v2_messy
    v2_multi_string = local.v2_multi_string
    v2_no_server = local.v2_no_server
    v2_pka_basic = local.v2_pka_basic
    v2_playwright = local.v2_playwright
    v2_secure = local.v2_secure
    v2_simple = local.v2_simple
    v2_supabase = local.v2_supabase
    v2_ucp_showcase = local.v2_ucp_showcase
  }
}