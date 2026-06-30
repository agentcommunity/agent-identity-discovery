/**
 * @agentcommunity/aid-engine
 *
 * This package contains the core business logic for discovering, validating,
 * and generating AID (Agent Identity & Discovery) records.
 *
 * It is intended to be consumed by other tools like the `aid-doctor` CLI and
 * the `web` workbench application. The boundary it enforces is "no filesystem
 * or CLI/process side effects" (those live in `aid-doctor`) — it is NOT pure
 * or deterministic:
 *
 * - It performs network I/O for discovery (DNS-over-HTTPS), TLS inspection
 *   (`tls.connect`), DNSSEC probing, and the PKA handshake (HTTP redirect +
 *   signature verification). Calling `runCheck` egresses to the network.
 * - It reads the wall clock (`Date.now()` / `new Date()`) for freshness/skew
 *   checks, so results are non-deterministic.
 * - It honors the `AID_SKIP_SECURITY` environment variable: when set to `'1'`,
 *   `runCheck` skips the TLS-redirect/inspection and PKA security checks.
 *   This WEAKENS security and exists only for offline/local testing — do not
 *   set it in production.
 */

export * from './types';
export * from './checker';
export * from './security-change';
export * from './error_messages';
export * from './generator';
export * from './keys';
