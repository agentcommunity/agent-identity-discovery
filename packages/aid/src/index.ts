/**
 * @agentcommunity/aid - Agent Identity & Discovery
 *
 * A minimal, DNS-based discovery protocol for AI agents.
 *
 * @example
 * ```typescript
 * import { discover, parse, AidError } from '@agentcommunity/aid';
 *
 * // Discover an agent by domain
 * const result = await discover('example.com');
 * console.log(result.record.uri); // https://api.example.com/mcp
 *
 * // Parse a TXT record directly
 * const record = parse('v=aid1;uri=https://api.example.com/mcp;proto=mcp');
 * console.log(record.proto); // "mcp"
 * ```
 */

// Re-export all constants and types for easy access
export * from './constants.js';

// Re-export parser functions and classes
export {
  AidError,
  parse,
  parseRawRecord,
  validateRecord,
  isValidProto,
  AidRecordValidator,
  canonicalizeRaw,
} from './parser.js';

// Security helpers
export { enforceRedirectPolicy } from './security.js';
export { performPKAHandshake } from './pka.js';
export type {
  SecurityMode,
  DnssecPolicy,
  PkaPolicy,
  DowngradePolicy,
  WellKnownPolicy,
  PreviousSecurityState,
  DiscoverySecurity,
  DiscoverySecurityWarning,
  SecurityPolicyOptions,
} from './discovery-security.js';

// Re-export client functions and types
export { type DiscoveryResult, type DiscoveryOptions, discover } from './client.js';

// Default export for convenience
export { discover as default } from './client.js';
