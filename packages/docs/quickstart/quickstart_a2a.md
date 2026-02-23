---
title: 'How to — A2A'
description: 'Discover and fetch an A2A AgentCard using AID'
icon: material/account-voice
---

# A2A (Agent-to-Agent)

Use AID to find an A2A `AgentCard` (`agent.json`), then fetch it.

## Publish (Providers)

If your agent's `AgentCard` is hosted at a public URL, you can make it discoverable.

1.  **Identify Your AgentCard URL:** This is the direct, stable URL to your `agent.json` file.
    - **Example:** `https://api.my-a2a-agent.com/agent.json`

2.  **Construct the AID TXT Record:** Use `a2a` for protocol. `uri` points to your `AgentCard`.
    - **Value:** `v=aid1;uri=https://api.my-a2a-agent.com/agent.json;proto=a2a;desc=My Autonomous A2A Agent`

3.  **Publish to DNS:** Add a `TXT` record at the `_agent` subdomain for `my-a2a-agent.com`.
    - **Type:** `TXT`
    - **Name (Host):** `_agent`
    - **Value:** The record content string from Step 2.

Your A2A agent's manifest is now globally discoverable.

## Discover & Fetch (Clients)

Your autonomous agent needs to interact with the agent at `my-a2a-agent.com`.

1.  **AID Lookup:** Discover the URI of the `AgentCard`.
2.  **Protocol Validation:** Ensure the `proto` is `a2a`.
3.  **Fetch AgentCard:** Make an HTTP GET request to the discovered URI.
4.  **Initiate A2A Communication:** Parse the fetched `AgentCard` and use its rich metadata (e.g., `url`, `preferredTransport`, `skills`, `securitySchemes`) to establish a connection.

TypeScript example (Node.js or Browser with fetch):

```ts
import { discover } from '@agentcommunity/aid';

// A simplified interface based on the A2A AgentCard specification
interface AgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  url: string; // The actual interaction endpoint
  preferredTransport?: string;
  skills: { id: string; name: string; description: string }[];
  securitySchemes?: { [scheme: string]: any };
}

async function connectToA2aAgent(domain: string) {
  try {
    // 1. Discover the AgentCard's location using AID
    console.log(`Discovering A2A AgentCard for ${domain}...`);
    const { record } = await discover(domain);

    // 2. Validate that it's an A2A agent
    if (record.proto !== 'a2a') {
      throw new Error(`Expected 'a2a' protocol, but found '${record.proto}'`);
    }
    console.log(`Found A2A AgentCard at: ${record.uri}`);

    // 3. Fetch the AgentCard from the discovered URI
    const res = await fetch(record.uri);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const agentCard = (await res.json()) as AgentCard;

    console.log(`Successfully fetched card for agent: "${agentCard.name}"`);
    console.log(`Description: ${agentCard.description}`);
    console.log(`Skills:`, agentCard.skills.map((s) => s.name).join(', '));

    // 4. Use the card's data to determine how to communicate
    const interactionEndpoint = agentCard.url; // This is the agent's actual endpoint
    const transport = agentCard.preferredTransport || 'jsonrpc';

    console.log(`Ready to initiate A2A task at ${interactionEndpoint} via ${transport}`);
    // Now, use your A2A library to send a task to the 'interactionEndpoint'...
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to connect to ${domain}:`, msg);
  }
}

// Replace with a real domain publishing an A2A AID record
connectToA2aAgent('a2a.agentcommunity.org'); // Fictional example domain
```

**Why AID here?** DNS gives you a stable, network-level pointer to the `AgentCard`. A2A handles the rest.

For libraries in other languages (including Rust/.NET/Java WIP), see the [Package Overview](./index.md#package-overview).

---

**Next:** [MCP Guide](quickstart_mcp.md) | [OpenAPI Guide](quickstart_openapi.md) | [Protocols & Auth](../Reference/protocols.md)
