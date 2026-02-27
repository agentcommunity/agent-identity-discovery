---
title: 'How to MCP'
description: 'Discover an MCP server endpoint with AID and start a session'
icon: material/connection
---

# MCP (Model Context Protocol)

Use AID to find the MCP server endpoint, then initialize your session.

## Publish (Providers)

If your MCP server is live and accepting JSON-RPC messages at a specific URL, you can make it instantly discoverable.

1.  **Identify Your MCP Endpoint:** This is the full URL where your server listens for the initial `initialize` request.
    - **Example:** `https://api.my-mcp-service.com/v1/mcp`

2.  **Construct the AID TXT Record:** Use `mcp` for protocol; `uri` is your JSON-RPC endpoint.
    - **Value:** `v=aid1;u=https://api.my-mcp-service.com/v1/mcp;p=mcp;s=My Awesome MCP Assistant`

3.  **Publish to DNS:** Go to your DNS provider and add a `TXT` record for your service's domain (`my-mcp-service.com`).
    - **Type:** `TXT`
    - **Name (or Host):** `_agent`
    - **Value:** The record content string from Step 2.

Your MCP server is now discoverable by any AID-aware client.

## Discover & Connect (Clients)

Your client application needs to connect to an MCP server, but you only know its domain name (e.g., `my-mcp-service.com`).

1.  **AID Lookup:** Use an AID library to find the agent's endpoint.
2.  **Protocol Validation:** Ensure the discovered protocol (`proto`) is `mcp`.
3.  **Initiate MCP Handshake:** Use the discovered URI to send the `initialize` request and begin the MCP session.

TypeScript example (pseudo MCP client shown for clarity):

```ts
import { discover } from '@agentcommunity/aid';
// This is a fictional MCP client library for demonstration.
// Use your actual MCP implementation.
import { createMcpClient, McpCapabilities } from 'your-mcp-client-library';

// Based on the MCP specification for the initialize handshake
interface ClientInfo {
  name: string;
  version?: string;
}

async function connectToMcpServer(domain: string) {
  try {
    // 1. Discover the agent's endpoint URI using AID
    console.log(`Discovering agent for ${domain}...`);
    const { record } = await discover(domain);

    // 2. Validate that it's an MCP agent
    if (record.proto !== 'mcp') {
      throw new Error(`Expected 'mcp' protocol, but found '${record.proto}'`);
    }

    console.log(`Found MCP agent at: ${record.uri}`);
    console.log(`Description: ${record.desc}`);

    // 3. Use the discovered URI to initiate the MCP lifecycle
    const mcpClient = createMcpClient({ endpoint: record.uri });

    const clientInfo: ClientInfo = { name: 'MyAwesomeClient', version: '1.0.0' };
    const capabilities: McpCapabilities = { sampling: {}, roots: { listChanged: true } };

    console.log('Sending MCP initialize request...');
    const { serverInfo } = await mcpClient.initialize({ clientInfo, capabilities });

    console.log(
      `Successfully connected to MCP server: ${serverInfo.name} (v${serverInfo.version})`,
    );
    // The MCP session is now active. You can proceed with other MCP operations.
    // e.g., const tools = await mcpClient.tools.list();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to connect to ${domain}:`, msg);
  }
}

// Use a domain that has published an AID record for its MCP server
connectToMcpServer('supabase.agentcommunity.org');
```

**Why AID here?** It turns a domain into the exact MCP endpoint, so clients can connect without hardcoding URLs.

---

**Next:** [A2A Guide](quickstart_a2a.md) | [OpenAPI Guide](quickstart_openapi.md) | [Protocols & Auth](../Reference/protocols.md)
