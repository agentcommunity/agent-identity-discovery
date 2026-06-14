---
title: 'aid-doctor CLI'
description: 'Validate, secure, and generate AID records'
icon: material/stethoscope
---

# aid-doctor (CLI)

## ELI5

Think of `aid-doctor` as a helpful mechanic for your domain’s agent record. You give it a domain; it looks up the `_agent.<domain>` TXT record, checks every detail, tries a safe fallback if needed, and tells you exactly what’s right or wrong. It also helps you create a perfect record and manage PKA keys.

> **Architecture Note**: `aid-doctor` is a CLI wrapper around `@agentcommunity/aid-engine`, a pure library containing all the core AID business logic. This separation allows other tools to reuse the same validation and discovery functionality.

```bash
# Human-readable check with detailed step-by-step report
aid-doctor check example.com

# JSON (for CI)
aid-doctor json example.com > result.json

# Generate an AID TXT record interactively
aid-doctor generate

# PKA helpers
aid-doctor pka generate
aid-doctor pka verify --key <base64url-jwk-x>
```

## What it does

`aid-doctor` provides a user-friendly CLI interface that orchestrates the `@agentcommunity/aid-engine` library:

- **Discovery & Validation**: Uses aid-engine for DNS-first discovery of `_agent.<domain>` and strict validation of record fields
- **Security Checks**: Leverages aid-engine for TLS validation, DNSSEC probing, and PKA handshake verification
- **Fallback Support**: Delegates `.well-known` fallback handling to aid-engine
- **CLI Features**: Adds user interaction, filesystem caching (`~/.aid/cache.json`), colored output, and draft saving
- **JSON Output**: Provides structured results for CI/CD pipelines
- **PKA Management**: Includes key generation and verification utilities
- **Standardized UX**: Consistent error messages and actionable recommendations
- **Test Coverage**: Comprehensive test coverage (12/12 tests passing)
- **Recommendations**: Actionable suggestions to fix common problems

## Example Output

```bash
$ aid-doctor check example.com
[1/6] DNS TXT _agent.example.com ... ✅ Found (DNS) (TTL 300, 112 bytes)
[2/6] Record validation ... ✅ Valid
[3/6] DNSSEC (RRSIG) ... 💡 Not detected
[4/6] TLS https://api.example.com/mcp ... ✅ Valid (SAN matches, expires in 84 days)
[5/6] PKA handshake ... ✅ Verified (alg=ed25519, keyid=<jwk-thumbprint>, domain-bound)
[6/6] Downgrade check ... ✅ No change

--- Summary ---
✅ Record is valid and secure.

--- Recommendations ---
💡 Enable DNSSEC: Improve the integrity of your DNS records by enabling DNSSEC at your domain registrar.
```

---

## Commands

### check

```bash
aid-doctor check <domain> \
  [--protocol <proto>] \
  [--probe-proto-subdomain] [--probe-proto-even-if-base] \
  [--timeout <ms>] [--no-fallback] [--fallback-timeout <ms>] \
  [--dump-well-known[=<path>]] [--check-downgrade] [--no-color] \
  [--domain-binding <off|prefer|require>]
```

- Base-first resolution. If `--protocol` is set, you may probe `_agent._<proto>.<domain>` for diagnostics.
- Shows numbered steps with ✅/❌/⚠️/💡 and a final summary.
- Honors `AID_SKIP_SECURITY=1` in CI to skip TLS inspection when needed.
- `--domain-binding` sets the domain-binding policy for the PKA handshake (default: `prefer`). When `prefer` or `require`, `aid-doctor` sends `AID-Domain: <domain>` on the PKA request and reports the result as `domain-bound` or `endpoint-proof only` in human output. When `require` and the endpoint returns an unbound proof, `aid-doctor` exits with `ERR_SECURITY`. Omit the flag to use the default (`prefer`).

### json

```bash
aid-doctor json <domain> [--protocol <proto>] [--timeout <ms>] [--no-fallback] [--fallback-timeout <ms>]
```

- Emits a structured report object including `queried`, `record`, `dnssec`, `tls`, `pka`, `downgrade`, and `exitCode`.

### generate (wizard)

```bash
aid-doctor generate [--save-draft <path>]
```

- Interactive prompts for `uri`, `proto`, optional `auth`, `desc`, `docs`, `dep`, and PKA (`pka`/`k`).
- Emits the canonical short-key TXT form (`v,u,p,a,s,d,e,k`) and copies it to the clipboard.
- Defaults to `v=aid2`; v1 compatibility records still use `i`/`kid` with PKA.
- `--save-draft` flag saves the generated record to a file for later deployment.

**Example with draft saving:**

```bash
$ aid-doctor generate --save-draft /path/to/my-record.txt
# ... interactive prompts ...
✅ Success! The TXT record value has been copied to your clipboard.
💾 Draft saved to /path/to/my-record.txt
```

### pka helpers

```bash
aid-doctor pka generate [--label <name>] [--out <dir>] [--print-private]
aid-doctor pka verify --key <base64url-jwk-x>
```

- Generate Ed25519 keys. For v2, this prints the unpadded base64url JWK `x` public key and its derived RFC 7638 JWK thumbprint `keyid`.
- Verify the format of a v2 PKA public key. Legacy v1 records use `z...` base58btc plus `kid`.

---

## Validation rules (summary)

- Required: `v=aid2`, `uri`, `proto`/`p` for new records. `v=aid1` remains valid for compatibility.
- Aliases: accept single-letter aliases; do not allow key+alias duplicates
- `desc`: ≤ 60 UTF‑8 bytes
- `docs`: absolute `https://` URL
- `dep`: ISO 8601 with `Z`. Errors if in the past, warns if in the future.
- Schemes: remote `https://` (or `wss://` for `websocket`); `local` uses `docker:`, `npx:`, `pip:`; `zeroconf:` for `zeroconf`
- Byte length: warn if TXT payload exceeds 255 bytes
- **Standardized Error Messages**: Consistent, actionable error messages across all validation paths

---

## Security checks

- DNSSEC: presence via DoH RRSIG probe (informational)
- TLS: first-hop redirect policy enforced; cert issuer/SAN/dates/days remaining (warns if < 21 days).
- PKA: Performs the v2 endpoint-proof handshake when `k` is present, using the derived RFC 7638 JWK thumbprint as `keyid`.
- PKA compatibility: Performs the legacy v1.1 handshake when an `aid1` record includes `pka`/`kid`.
- Domain binding: When `--domain-binding prefer` (default) or `--domain-binding require` is active, sends `AID-Domain: <domain>` on the PKA request. Human output labels the result `domain-bound` (tag `aid-pka-v2-db` verified) or `endpoint-proof only` (tag `aid-pka-v2`, unbound). JSON output includes `domainBound: true | false` in the `pka` object. A `BINDING_LOSS` warning is emitted when a domain previously returned a domain-bound proof (`domainBound: true`) but the current check returns an unbound one — indicating a server-side regression in binding support.
- Downgrade: warns if a domain previously had PKA and now removed or changed it (`--check-downgrade` flag required).

---

## JSON output shape (abridged)

```json
{
  "domain": "example.com",
  "queried": { "strategy": "base-first", "attempts": [], "wellKnown": {} },
  "record": {
    "raw": "...",
    "parsed": { "v": "aid2", "uri": "...", "proto": "mcp" },
    "valid": true
  },
  "dnssec": { "present": false, "method": "RRSIG", "proof": null },
  "tls": { "checked": true, "valid": true, "host": "...", "san": ["..."], "daysRemaining": 84 },
  "pka": { "present": true, "attempted": true, "verified": true, "kid": null, "domainBound": true },
  "downgrade": { "checked": true, "status": "no_change" },
  "exitCode": 0
}
```

---

## Exit codes

- 0 success
- 1000 `ERR_NO_RECORD`
- 1001 `ERR_INVALID_TXT`
- 1002 `ERR_UNSUPPORTED_PROTO`
- 1003 `ERR_SECURITY`
- 1004 `ERR_DNS_LOOKUP_FAILED`
- 1005 `ERR_FALLBACK_FAILED`
- 1 unknown

---

## Tips

- Publish short keys (`u,p,a,s,d,e,k`) as the canonical v2 TXT format.
- Enable DNSSEC at your registrar; it improves integrity.
- Add `k`/`pka` for endpoint proof. In v2, the HTTP signature `keyid` is derived from `k`; legacy v1 compatibility records still use `kid`.
- Domain binding is on by default: `aid-doctor` sends `AID-Domain` whenever PKA is performed. Use `--domain-binding off` to disable, or `--domain-binding require` to enforce hard binding (exits with `ERR_SECURITY` on unbound proofs). Check for `BINDING_LOSS` warnings in CI to catch server-side regressions.
- For dev-only loopback `.well-known`, set `AID_ALLOW_INSECURE_WELL_KNOWN=1`.
- Use `--save-draft` with `generate` to save records for later deployment.
- Error messages are standardized for consistent troubleshooting experience.

For change windows, ownership split, and staged `balanced` to `strict` adoption, see the [Enterprise Rollout Playbook](../Reference/enterprise_rollout.md).
