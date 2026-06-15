### Workbench Architecture v1.5 – Components and Data Flow

## Overview

This document describes the v1.5 workbench after the web focus cleanup and resolver hardening:

- Security-aware discovery
- Protocol-aware connection handling via modular registry (MCP, A2A, OpenAPI, GraphQL, gRPC, WebSocket, Local, Zeroconf, UCP)
- A2A Agent Card fetching and display
- Improved auth error UX with protocol-appropriate prompts
- Signal-first resolver timeline with stage transitions (`running -> success/error/needs_auth`)
- Spec-compliant generator driven by server validation (aid-engine)
- Compact UI with decomposed modules for maintainability

## File Map (key paths)

```
packages/web/
  src/components/workbench/
    discovery-chat.tsx        # Chat UI container (resolver)
    collapsible-result.tsx    # Collapsible status row with signal icon
    generator-panel.tsx       # Thin composition root (form + preview)
    example-picker.tsx        # Quick-access buttons for demo domains
    title-section.tsx         # Mode title

    blocks/                   # Resolver detail blocks
      index.ts                # Barrel exports
      shared.tsx              # Shared types (ToolStatus, ErrorWithMetadata) + StepTimeline
      discovery-block.tsx     # DiscoveryToolBlock + DiscoveryDetailsView
      connection-block.tsx    # ConnectionToolBlock + ProtocolGuidanceView + ConnectionDetailsView

    generator/                # Extracted from generator-panel.tsx
      preview-panel.tsx       # TXT/JSON preview card with alias toggle
      validation-summary.tsx  # Error list component

    v11-fields/
      core-fields.tsx         # Protocol/Auth/URI/Domain
      metadata-fields.tsx     # Desc (≤60 bytes)/Docs/Dep picker
      security-fields.tsx     # PKA/KID + optional PKA generator

    tool-call-block.tsx       # Generic expandable container
    a2a-card.tsx              # A2A Agent Card display component
    auth-prompts/             # Modular auth prompt components
      index.tsx               # Routes to appropriate prompt by authType
      auth-prompt.tsx         # Generic token input
      pat-prompt.tsx          # PAT-specific prompt
      oauth-prompt.tsx        # OAuth2 device/code flow prompts
      local-cli-notice.tsx    # Local CLI required notice

  src/app/
    layout.tsx                # Root shell (fixed-height, single scroll owner)
    page.tsx                  # Landing page
    workbench/page.tsx        # Resolver/Generator toggle with scroll reset
    api/
      generator/validate/route.ts # Server validation via aid-engine (SSOT)
      handshake/route.ts          # Protocol-aware proxy using protocol registry

  src/hooks/
    use-chat-engine.ts        # Public façade → re-exports from chat-engine/
    chat-engine/              # Extracted from use-chat-engine.ts
      index.ts                # Barrel exports
      types.ts                # ChatLogMessage, EngineState, EngineCommand, Action, StatusSignal
      reducer.ts              # Reducer + initialState + helpers (uniqueId, normalizeDomainInput)
      signals.ts              # Signal builders/classification for discovery/connection/auth
      orchestration.ts        # processDomain + provideAuth (stateless functions + signal transitions)
      hook.ts                 # useChatEngine hook (thin wrapper)
    use-discovery.ts          # Resolver (browser)
    use-connection.ts         # Handshake client hook + types
    use-generator-form.ts     # Generator form state + server validation
    use-pka-verification.ts   # WebCrypto Ed25519

  src/lib/protocols/          # Protocol handler registry
    index.ts                  # Registry and handleProtocol() function
    types.ts                  # ProtocolHandler, ProtocolResult, AgentCard interfaces
    utils.ts                  # Helper functions
    handlers/
      mcp.ts                  # MCP SDK handshake handler
      a2a.ts                  # A2A agent card fetcher
      guidance.ts             # Generic guidance for other protocols

  src/lib/datasources/
    types.ts                  # Datasource interface + HandshakeOptions
    live-datasource.ts        # Real network operations
    mock-datasource.ts        # Mock for demos/tests

  src/lib/generator/
    core.ts                   # Lightweight client helpers (UI only)
    types.ts                  # Form data + validation types

  src/generated/
    examples.ts               # Auto-generated from protocol/examples.yml
    spec.ts                   # Mirrored from protocol/spec.ts

  src/app/globals.css         # Design tokens with --gradient-start/--gradient-end

  src/components/ui/
    codeblock.tsx             # Constrained previews (mobile-safe)
    dep-picker.tsx            # Calendar → ISO 8601 Z
    pka-key-generator.tsx     # WebCrypto keypair (client only)
    security-badge.tsx        # Status chip (DNSSEC/PKA/TLS)
    tls-inspector.tsx         # TLS validity/expiry summary
```

## Scroll Model

- **Root shell** (`layout.tsx`): `h-dvh flex-col overflow-hidden` — fixed viewport height.
- **Main region** (`<main>`): `flex-1 min-h-0 overflow-y-auto` — single scroll owner for landing pages.
- **Workbench page**: `overflow-hidden` with absolute-positioned panels. Each panel owns its own scroll via `data-scroll-region`.
- **Mode switch** (`#generator` ↔ resolver): scroll offset resets to 0 on the incoming panel.

## Module Layout (v1.5)

### Resolver UI modules

| Concern                                    | Module                        |
| ------------------------------------------ | ----------------------------- |
| Discovery details and diagnostics          | `blocks/discovery-block.tsx`  |
| Connection details, guidance, auth prompts | `blocks/connection-block.tsx` |
| Shared block status/timeline helpers       | `blocks/shared.tsx`           |
| Collapsible signal row surface             | `collapsible-result.tsx`      |

### use-chat-engine.ts → chat-engine/

| Before (382 lines)                        | After                          |
| ----------------------------------------- | ------------------------------ |
| Message types, EngineState, Action        | `chat-engine/types.ts`         |
| Reducer + helpers                         | `chat-engine/reducer.ts`       |
| Signal classification + hint generation   | `chat-engine/signals.ts`       |
| processDomain + provideAuth + transitions | `chat-engine/orchestration.ts` |
| Hook wrapper                              | `chat-engine/hook.ts`          |

### generator-panel.tsx → generator/ + hook

| Before (309 lines)                    | After                              |
| ------------------------------------- | ---------------------------------- |
| Form state + server validation effect | `hooks/use-generator-form.ts`      |
| Preview card                          | `generator/preview-panel.tsx`      |
| Error display                         | `generator/validation-summary.tsx` |
| Composition root                      | `generator-panel.tsx` (slim)       |

## Visual Token Hygiene

Gradient colors are defined as CSS custom properties (`--gradient-start`, `--gradient-end`) in `:root` and consumed only by `.gradient-primary`, `.gradient-text`, `.gradient-border`. These classes are used exclusively in landing page components. Workbench surfaces do not reference gradient classes.

## Core Concepts

- **Single Source of Truth (SSOT)**: Validation and TXT building are performed on the server using aid-engine. The browser provides fast, lightweight checks for UX only.
- **Protocol Agnostic Discovery**: AID discovers agents regardless of protocol; the workbench provides appropriate guidance for each.
- **Modular Protocol Registry**: Each protocol has a dedicated handler class, making it easy to add new protocols.
- **Signal-First Resolver Timeline**: Resolver emits stage signals (`input`, `discovery`, `connection`, `auth`) and updates each stage in place from `running` to final state.
- **Progressive Disclosure**: Security elements and details are visible but unobtrusive (badges; drawers).
- **Separation of Concerns**: UI components are small and declarative; server routes handle validation and protocol logic.

## Resolver Signal Pipeline

The resolver chat is modeled as stage signals rather than ad-hoc narrative cards.

1. Submit domain input.
2. Emit `discovery/running` signal row.
3. Replace that same row with `discovery/success|error`.
4. If discovery succeeds, emit `connection/running`.
5. Replace that same row with `connection/success|needs_auth|error`.
6. If auth is provided, emit `auth/running` and replace with final auth result.

Key implementation details:

- `chat-engine/orchestration.ts` now calls `REPLACE_MESSAGE` to transition stage rows in place.
- `chat-engine/signals.ts` maps errors to spec-style codes and remediation hints.
- `discovery-chat.tsx` renders consecutive signal rows as a visual chain.
- `collapsible-result.tsx` uses a non-spinning running icon to avoid "stuck" perception.

## Protocol Registry Architecture

The protocol handling system is built around a registry pattern in `src/lib/protocols/`:

### ProtocolHandler Interface

```typescript
interface ProtocolHandler {
  token: ProtocolToken;
  canConnect: boolean;
  handle(options: ProtocolHandlerOptions): Promise<ProtocolResult>;
}
```

### Protocol Handlers

| Handler           | File                   | Behavior                                             |
| ----------------- | ---------------------- | ---------------------------------------------------- |
| `MCPHandler`      | `handlers/mcp.ts`      | MCP SDK handshake, returns capabilities              |
| `A2AHandler`      | `handlers/a2a.ts`      | Fetches `/.well-known/agent.json`, returns AgentCard |
| `GuidanceHandler` | `handlers/guidance.ts` | Returns protocol-specific guidance (no connection)   |

## Auth Error Handling

Auth errors are handled with protocol-appropriate prompts via `AuthPrompts` component:

### Auth Type Decision Tree

```
needsAuth = true?
├── URI scheme is local (npx:, docker:, pip:)?
│   └── Show LocalCliNotice + command
├── auth field = 'pat'?
│   └── Show PatPrompt + token input
├── auth field = 'oauth2_device'?
│   └── Show OAuthPrompt (device flow)
├── auth field = 'oauth2_code'?
│   └── Show OAuthPrompt (code flow)
├── compliantAuth = true?
│   └── Show OAuthPrompt with metadata
└── Default
    └── Show generic token input
```

## Examples System

Examples are defined in `protocol/examples.yml` and auto-generated via `pnpm gen`.

## Extensibility

- **New protocols**: Create handler in `src/lib/protocols/handlers/`, register in `index.ts`
- **New spec keys**: Add to server route mapping and optional UI rendering; UI stays stable
- **New security indicators**: Add a SecurityBadge or drawer entry; no layout churn
- **New examples**: Add to `protocol/examples.yml`, run `pnpm gen`
- **New auth types**: Add case to `AuthPrompts` component and create prompt component
