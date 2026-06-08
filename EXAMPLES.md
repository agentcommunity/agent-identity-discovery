# AID Examples - Development Guide

This document explains the AID examples system: how examples are defined, generated, and used across the codebase.

## Overview

AID uses examples for:

- **Testing**: Valid AID records for parser validation and CI checks
- **Documentation**: Concrete examples in specifications and guides
- **Development**: Live DNS records for integration testing
- **UI**: Interactive examples in the workbench web interface

## Single Source of Truth

All examples are defined in `protocol/examples.yml` and generated into multiple outputs via `pnpm gen`.

```mermaid
graph TD
    A[protocol/examples.yml] --> B[pnpm gen]
    B --> C[showcase/terraform/examples.tf]
    B --> D[packages/web/src/generated/examples.ts]
    C --> E[Live DNS Records]
    D --> F[Workbench UI]
```

## File Structure

### `protocol/examples.yml`

```yaml
examples:
  # Educational examples for learning AID format
  basic:
    simple:
      domain: 'simple.agentcommunity.org'
      record: 'v=aid2;u=https://api.example.com/mcp;p=mcp;a=pat;s=Basic MCP Example'
      icon: '🤖'
      description: 'Simple MCP server example'
      category: 'basic'

  # Real-world service examples (with PKA)
  real_world:
    firecrawl:
      domain: 'firecrawl.agentcommunity.org'
      record: 'v=aid2;u=https://api.firecrawl.dev;p=a2a;k=ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ;d=https://docs.firecrawl.dev/mcp-server;s=Firecrawl A2A (Mock Service)'
      icon: '🔥'
      description: 'Firecrawl web scraping service'
      category: 'real_world'

  # Error cases for testing
  error_cases:
    deprecated:
      domain: 'deprecated.agentcommunity.org'
      record: 'v=aid2;u=https://api.deprecated.org/mcp;p=mcp;e=2025-12-31T23:59:59Z;s=Deprecated service'
      icon: '⚠️'
      description: 'Deprecated service example'
      category: 'error_cases'
```

### Generated Files

#### `showcase/terraform/examples.tf`

Terraform locals for DNS deployment:

```hcl
locals {
  firecrawl = {
    name  = "_agent.firecrawl"
    value = "v=aid2;u=https://api.firecrawl.dev;p=a2a;k=ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ;d=https://docs.firecrawl.dev/mcp-server;s=Firecrawl A2A (Mock Service)"
  }

  all_examples = {
    firecrawl = local.firecrawl
    # ... other examples
  }
}
```

#### `packages/web/src/generated/examples.ts`

TypeScript constants for UI:

```typescript
export interface Example {
  title: string;
  label?: string;
  icon: ExampleIcon;
  content: string;
  domain: string;
  category: string;
}

export const BASIC_EXAMPLES: Example[] = [
  /* ... */
];
export const REAL_WORLD_EXAMPLES: Example[] = [
  /* ... */
];
export const OTHER_CHAT_EXAMPLES: Example[] = [
  /* ... */
];
```

## Adding New Examples

### 1. Edit `protocol/examples.yml`

Add your example under the appropriate category:

```yaml
real_world:
  your_service:
    domain: 'your-service.agentcommunity.org'
    record: 'v=aid2;u=https://api.your-service.com;p=mcp;k=ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ;d=https://docs.your-service.com;s=Your Service Description'
    icon: '🚀' # or "/icons/your-service.svg"
    description: 'Your service description'
    category: 'real_world'
```

### 2. Generate Files

```bash
pnpm gen
```

This updates:

- `showcase/terraform/examples.tf` (for DNS deployment)
- `packages/web/src/generated/examples.ts` (for UI)

### 3. Deploy DNS Records (Optional)

If you want live DNS records for your example:

```bash
cd showcase/terraform
terraform plan -var="zone=agentcommunity.org" -var="team_id=YOUR_TEAM_ID"
terraform apply -var="zone=agentcommunity.org" -var="team_id=YOUR_TEAM_ID"
```

## Example Categories

### `basic`

Educational examples demonstrating AID concepts:

- Simple records without PKA
- Format variations (messy, multi-string)
- Different protocols (MCP, local, etc.)

### `real_world`

Live service examples with full PKA authentication:

- Real domains (firecrawl.agentcommunity.org, etc.)
- Production-ready records with cryptographic keys
- Used for integration testing

### `error_cases`

Edge cases and error conditions:

- Deprecated services
- Offline/non-responsive endpoints
- Invalid record formats

## PKA Keys

All real-world examples include Public Key Authentication. New examples use the v2 PKA shape:

- **Format**: unpadded base64url Ed25519 JWK `x` in `k`/`pka`
- **Key ID**: derived RFC 7638 JWK thumbprint used as the HTTP signature `keyid`; no DNS `kid`/`i`
- **Handshake**: RFC 9421 `Accept-Signature` nonce, mandatory `created` and `expires`, and response `Cache-Control: no-store`
- **Purpose**: Endpoint proof via HTTP Message Signatures (RFC 9421)

Example v2 PKA record:

```
k=ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ
```

Legacy `aid1` compatibility examples may still use `k=z...` base58btc plus `i`/`kid`, `AID-Challenge`, signed HTTP `Date`, and signature `keyid` matching DNS `kid`. Label those examples as legacy when adding them.

## Icons

Examples support multiple icon formats:

- **Emojis**: `"🔥"`, `"🤖"`, `"⚠️"`
- **Image paths**: `"/icons/supabase.svg"`
- **React components**: Only in generated TS (converted from strings)

## Validation

### CI Checks

GitHub Actions automatically validates that generated files are up-to-date:

```yaml
- name: Check generated files are up-to-date
  run: |
    pnpm gen
    git diff --exit-code
```

### Manual Testing

Test examples work correctly:

```bash
# Test DNS resolution
pnpm -C packages/aid-doctor run check firecrawl.agentcommunity.org

# Test web UI examples
pnpm -C packages/web dev
# Visit http://localhost:3000/workbench
```

## Troubleshooting

### Generated files out of sync

```bash
# Regenerate everything
pnpm gen

# Check what changed
git diff
```

### PKA key validation

```bash
# Test PKA handshake
pnpm -C packages/aid-doctor run check --pka firecrawl.agentcommunity.org
```

### DNS deployment issues

```bash
# Check Terraform plan
cd showcase/terraform
terraform plan -var="zone=agentcommunity.org" -var="team_id=YOUR_TEAM_ID"
```

## Related Files

- `scripts/generate-examples.ts` - Generation script
- `showcase/terraform/main.tf` - DNS deployment
- `packages/web/src/lib/constants.ts` - UI imports
- `AGENTS.md` - High-level generation docs

## Contributing

When adding examples:

1. Follow the YAML structure in `protocol/examples.yml`
2. Include PKA keys for real-world examples
3. Test DNS resolution and PKA validation
4. Update this document if needed
5. Run `pnpm gen` before committing
