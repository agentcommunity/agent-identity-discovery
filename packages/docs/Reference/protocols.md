---
title: 'Protocols & Auth Tokens'
description: 'All supported proto and auth tokens with URI requirements and examples'
icon: material/format-list-bulleted
---

# Protocols & Auth

The `proto` key (alias `p`) declares which protocol the agent endpoint speaks. The `auth` key (alias `a`) hints at the authentication method required. Both are defined in the [Specification](../specification.md) appendices.

## Supported `proto` Tokens

AID v1.1 defines **9 protocol tokens**. Remote protocols require `https://` URIs (or `wss://` for WebSocket). Local protocols use scheme-specific URIs.

### `mcp` — Model Context Protocol

JSON-RPC endpoint implementing the [Model Context Protocol](https://modelcontextprotocol.io/). The most common token for AI agent discovery.

- **URI scheme:** `https://`
- **Use case:** LLM tool servers, AI assistants, coding agents

```text
v=aid1;u=https://api.example.com/mcp;p=mcp;a=oauth2_code;s=AI Assistant
```

### `a2a` — Agent-to-Agent Protocol

URL to an [A2A AgentCard](https://google.github.io/A2A/) (`agent.json`). Used for agent-to-agent interoperability.

- **URI scheme:** `https://`
- **Use case:** Multi-agent orchestration, agent marketplaces

```text
v=aid1;u=https://agent.example.com/.well-known/agent.json;p=a2a;s=Task Agent
```

### `openapi` — OpenAPI Specification

URL to an OpenAPI document (JSON or YAML). Allows clients to discover and interact with REST APIs.

- **URI scheme:** `https://`
- **Use case:** Traditional REST APIs, API gateways, tools that generate client code

```text
v=aid1;u=https://api.example.com/openapi.json;p=openapi;s=Public API
```

### `grpc` — gRPC over HTTP/2

gRPC service endpoint. Clients connect using gRPC over HTTP/2 (or HTTP/3).

- **URI scheme:** `https://`
- **Use case:** High-performance inter-service communication, streaming, polyglot environments

```text
v=aid1;u=https://grpc.example.com;p=grpc;a=mtls;s=Inference Service
```

### `graphql` — GraphQL over HTTP

GraphQL endpoint. Clients send queries via HTTP POST (or GET for persisted queries).

- **URI scheme:** `https://`
- **Use case:** Flexible data queries, frontend-driven APIs, aggregation layers

```text
v=aid1;u=https://api.example.com/graphql;p=graphql;a=pat;s=Data Gateway
```

### `websocket` — WebSocket Transport

WebSocket endpoint for persistent, bidirectional communication.

- **URI scheme:** `wss://`
- **Use case:** Real-time streaming, chat agents, event-driven architectures

```text
v=aid1;u=wss://ws.example.com/agent;p=websocket;s=Live Agent
```

### `local` — Local Execution

The agent runs locally on the client machine. URI uses scheme-specific locators for the execution environment.

- **URI schemes:** `docker:`, `npx:`, `pip:`
- **Use case:** Development, offline agents, privacy-sensitive workloads
- **Security:** Requires explicit user consent before execution. See [Security](security.md#local-execution-safeguards-protolocal).

```text
v=aid1;u=docker:myorg/agent:latest;p=local;s=Local Dev Agent
v=aid1;u=npx:@myorg/agent-cli;p=local;s=CLI Agent
v=aid1;u=pip:my-agent;p=local;s=Python Agent
```

### `zeroconf` — mDNS/DNS-SD Service Discovery

Local network service discovery via mDNS/DNS-SD. Used to find agents on the same LAN.

- **URI scheme:** `zeroconf:<service_type>`
- **Use case:** IoT devices, local development environments, LAN-only agents

```text
v=aid1;u=zeroconf:_mcp._tcp;p=zeroconf;s=Office Agent
```

### `ucp` — Universal Commerce Protocol

Endpoint implementing the Universal Commerce Protocol for commercial agent transactions.

- **URI scheme:** `https://`
- **Use case:** E-commerce agents, payment flows, commercial service orchestration

```text
v=aid1;u=https://commerce.example.com/ucp;p=ucp;a=oauth2_code;s=Commerce Agent
```

## Protocol Summary

| Token       | URI Scheme                | Transport          | Typical Auth            |
| ----------- | ------------------------- | ------------------ | ----------------------- |
| `mcp`       | `https://`                | JSON-RPC over HTTP | `oauth2_code`, `pat`    |
| `a2a`       | `https://`                | HTTP (AgentCard)   | `oauth2_code`, `apikey` |
| `openapi`   | `https://`                | HTTP REST          | `apikey`, `pat`         |
| `grpc`      | `https://`                | HTTP/2 gRPC        | `mtls`, `pat`           |
| `graphql`   | `https://`                | HTTP POST          | `pat`, `oauth2_code`    |
| `websocket` | `wss://`                  | WebSocket          | `pat`, `oauth2_code`    |
| `local`     | `docker:`, `npx:`, `pip:` | Local process      | `none`                  |
| `zeroconf`  | `zeroconf:`               | mDNS/DNS-SD        | `none`                  |
| `ucp`       | `https://`                | HTTP               | `oauth2_code`           |

## Auth Hints (`auth`)

The `auth` key (alias `a`) tells clients what authentication method to expect. It is a **hint** — the actual authentication flow is handled by the target protocol.

| Token           | Description                                |
| --------------- | ------------------------------------------ |
| `none`          | No authentication required                 |
| `apikey`        | Static API key (header or query parameter) |
| `pat`           | Personal access token                      |
| `basic`         | HTTP Basic authentication                  |
| `mtls`          | Mutual TLS (client certificate)            |
| `oauth2_code`   | OAuth 2.0 Authorization Code flow          |
| `oauth2_device` | OAuth 2.0 Device Code flow                 |
| `custom`        | Provider-defined authentication            |

### Example with auth

```text
v=aid1;u=https://api.example.com/mcp;p=mcp;a=pat;s=Example MCP
```

## Notes

- Prefer full key names (`proto`, `auth`); single-letter aliases (`p`, `a`) exist for byte efficiency in DNS TXT records.
- `desc`/`s` is optional, max 60 UTF-8 bytes.
- Remote protocols MUST use `https://` (or `wss://` for `websocket`).
- `local` uses approved schemes only: `docker:`, `npx:`, `pip:`.
- Use the [aid-doctor CLI](../Tooling/aid_doctor.md) to validate records and generate compliant configurations.

## See Also

- [Quick Start](../quickstart/index.md)
- [Troubleshooting](troubleshooting.md)
- [Conformance](../Tooling/conformance.md)
