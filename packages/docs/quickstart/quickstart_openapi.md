---
title: 'OpenAPI'
description: 'Discover an OpenAPI spec URL using AID and fetch it'
icon: material/api
---

# OpenAPI

**Target Audience:** API providers and developers of tools or agents that consume APIs programmatically.

**Goal:** To use AID to discover an API's OpenAPI specification document, enabling dynamic client generation or autonomous agent interaction.

OpenAPI provides a standard for describing REST APIs. AID makes the specification itself discoverable, transforming any API into a resource that can be understood and used by autonomous agents.

## Publish (Providers)

If your OpenAPI specification is hosted at a public URL, you can make it discoverable.

1.  **Identify Your OpenAPI Spec URL:** This is the direct URL to your `openapi.json` or `openapi.yaml` file.
    - **Example:** `https://api.my-service.io/v3/openapi.json`

2.  **Construct the AID TXT Record:** Use `openapi` for protocol; `uri` points to your spec file.
    - **Value:** `v=aid1;u=https://api.my-service.io/v3/openapi.json;p=openapi;s=My Public Service API`

3.  **Publish to DNS:** Add a `TXT` record at the `_agent` subdomain for `my-service.io`.
    - **Type:** `TXT`
    - **Name (Host):** `_agent`
    - **Value:** The record content string from Step 2.

Your API's capabilities are now discoverable by any agent or tool that understands OpenAPI.

## Discover & Fetch (Clients)

Your application or agent needs to interact with the API provided by `my-service.io`.

1.  **AID Lookup:** Discover the location of the OpenAPI specification file.
2.  **Protocol Validation:** Ensure the `proto` is `openapi`.
3.  **Fetch the OpenAPI Spec:** Make an HTTP GET request to the discovered URI.
4.  **Interact with the API:** Use the fetched specification to dynamically configure an API client or allow an autonomous agent to reason about the API's endpoints, schemas, and required parameters.

TypeScript example using fetch:

```ts
import { discover } from '@agentcommunity/aid';
// For production, consider 'swagger-client' or 'openapi-typescript-codegen'

interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  paths: object;
}

async function discoverAndAnalyzeApi(domain: string) {
  try {
    // 1. Discover the OpenAPI spec's location using AID
    console.log(`Discovering OpenAPI spec for ${domain}...`);
    const { record } = await discover(domain);

    // 2. Validate the protocol
    if (record.proto !== 'openapi') {
      throw new Error(`Expected 'openapi' protocol, but found '${record.proto}'`);
    }
    console.log(`Found OpenAPI spec at: ${record.uri}`);

    // 3. Fetch the OpenAPI specification
    const res = await fetch(record.uri);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const spec = (await res.json()) as OpenApiSpec;

    // 4. Analyze the spec for programmatic use
    console.log(`Successfully fetched spec for API: "${spec.info.title}" (v${spec.info.version})`);
    console.log(`Description: ${spec.info.description}`);

    const endpoints = Object.keys(spec.paths);
    console.log(`Discovered ${endpoints.length} endpoints: ${endpoints.slice(0, 3).join(', ')}...`);

    // An autonomous agent could now use this 'spec' object to:
    // - Understand which endpoints are available.
    // - Know the required parameters and request body schemas.
    // - Formulate valid API calls to achieve a goal.
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to connect to ${domain}:`, msg);
  }
}

// Replace with a real domain publishing an OpenAPI AID record
discoverAndAnalyzeApi('openapi.agentcommunity.org'); // Fictional example domain
```

**Why AID here?** It turns a domain into the canonical OpenAPI spec URL, enabling dynamic client setup.

For libraries in other languages (including Rust/.NET/Java WIP), see the [Package Overview](./index.md#package-overview).

---

**Next:** [MCP Guide](quickstart_mcp.md) | [A2A Guide](quickstart_a2a.md) | [Protocols & Auth](../Reference/protocols.md)
