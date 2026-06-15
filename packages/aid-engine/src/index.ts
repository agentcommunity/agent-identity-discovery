/**
 * @agentcommunity/aid-engine
 *
 * This package contains the core business logic for discovering, validating,
 * and generating AID (Agent Identity & Discovery) records.
 *
 * It is a pure, stateless library intended to be consumed by other tools
 * like the `aid-doctor` CLI and the `web` workbench application.
 */

export * from './types';
export * from './checker';
export * from './security-change';
export * from './error_messages';
export * from './generator';
export * from './keys';
