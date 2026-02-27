/**
 * Standardized error messages for aid-doctor CLI
 * Ensures consistency across all modules
 */

export const ERROR_MESSAGES = {
  // General
  UNKNOWN_ERROR: 'An unexpected error occurred. Please check your input and try again.',

  // DNS
  DNS_LOOKUP_FAILED:
    'DNS lookup failed for the specified domain. Check network connectivity and domain spelling.',
  NO_RECORD_FOUND:
    'No AID TXT record found for the domain. Ensure the record exists at _agent.<domain>.',

  // Record validation
  INVALID_TXT_FORMAT:
    'The AID TXT record has an invalid format. Ensure it follows v=aid1;key=value;... structure.',
  UNSUPPORTED_PROTOCOL:
    'The specified protocol is not supported. See the official protocol registry for valid tokens.',
  DEPRECATED_RECORD:
    'The AID record has been deprecated. Check the deprecation date and update accordingly.',

  // Security
  SECURITY_VIOLATION: 'A security check failed. The record or endpoint may be compromised.',
  TLS_VALIDATION_FAILED:
    'TLS certificate validation failed. Ensure the certificate is valid and not expired.',
  PKA_HANDSHAKE_FAILED:
    'PKA endpoint proof handshake failed. Verify the public key and private key configuration.',

  // Fallback
  FALLBACK_FAILED: 'The .well-known fallback failed. Ensure the HTTPS endpoint returns valid JSON.',

  // Byte limits
  BYTE_LIMIT_EXCEEDED: 'The record exceeds the 255-byte DNS limit. Use aliases and shorten fields.',

  // Warnings
  BYTE_LIMIT_WARNING: 'Record size is close to the 255-byte limit. Consider using aliases.',
  TLS_EXPIRING_SOON: 'TLS certificate expires soon. Renew to avoid interruptions.',
  DNSSEC_NOT_DETECTED: 'DNSSEC not detected. Enable for better integrity.',
  PKA_NOT_PRESENT: 'Endpoint proof (PKA) not present. Consider adding for security.',
  LONG_KEY_COMPAT:
    'Long TXT keys are compatibility-only in v1.x. Publish short keys (v,u,p,a,s,d,e,k,i) as the canonical wire format.',
  DOWNGRADE_DETECTED:
    'Security downgrade detected: a previously present PKA or KID has been removed.',

  // Recommendations
  ENABLE_DNSSEC: 'Enable DNSSEC at your domain registrar to improve DNS integrity.',
  ADD_PKA: "Add PKA endpoint proof by running 'aid-doctor pka generate'.",
  RENEW_TLS: 'Renew your TLS certificate soon to avoid expiration.',
  USE_ALIASES: 'Use single-letter aliases (e.g., u for uri) to reduce record size.',
} as const;
