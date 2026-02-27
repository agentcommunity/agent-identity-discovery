---
title: 'Enterprise Rollout'
description: 'Rollout playbook for DNS teams and application teams adopting AID in production.'
icon: material/clipboard-check-outline
---

# Enterprise Rollout Playbook

Use this playbook when DNS ownership and application ownership are split across teams.

AID rollout usually fails on coordination, not syntax. Treat the `_agent.<domain>` record, DNSSEC, TLS, and PKA as one change set.

## Ownership Model

Split responsibilities clearly before the first rollout.

### DNS team

- Own the `_agent.<domain>` TXT record.
- Own DNSSEC enablement and DS record publication.
- Own TTL changes and rollback windows.
- Own delegated subdomain records when the application team does not control the parent zone.

### Application team

- Own the agent endpoint, TLS certificate, and protocol behavior.
- Own `pka` and `kid` generation, storage, and rotation.
- Own `.well-known` only when that fallback is intentionally allowed.
- Own post-change verification with `aid-doctor` and SDK smoke tests.

### Shared handoff

Agree on these values before rollout:

- queried hostname
- published `_agent` name
- target `uri`
- `proto`
- TTL during change window
- DNSSEC expectation
- PKA requirement
- rollback owner

## Deployment Patterns

AID discovery is exact-host only. Do not rely on parent-domain walking.

### Pattern A: apex or standard host deployment

Use this when the domain itself should resolve directly.

```dns
_agent.example.com. 300 IN TXT "v=aid1;u=https://api.example.com/mcp;p=mcp;i=g1;k=z6Mk..."
```

Use this for:

- `example.com`
- `api.example.com`
- `agent.example.com`

### Pattern B: delegated subdomain deployment

Use this when the application team needs isolated control.

Parent zone:

```dns
_agent.team.example.com. 300 IN NS ns1.team-dns.example.net.
_agent.team.example.com. 300 IN NS ns2.team-dns.example.net.
```

Delegated zone:

```dns
_agent.app.team.example.com. 300 IN TXT "v=aid1;u=https://app.team.example.com/mcp;p=mcp;i=g1;k=z6Mk..."
```

Use this when:

- the DNS team owns `example.com`
- the app team owns `team.example.com` or a delegated `_agent` subtree
- you need team-level isolation without changing client discovery behavior

Do not publish multiple valid AID TXT records at the same queried name. Use distinct hostnames or route behind one endpoint.

## Rollout Sequence

Use a controlled change window.

### 1. Prepare

- Lower TTL to `60-120` seconds if you expect a near-term cutover.
- Confirm the endpoint is live before DNS changes.
- Generate `pka` and `kid` if the environment will use `balanced` or `strict` with identity proof.
- Decide whether `.well-known` fallback is allowed. In `strict`, it is not.

### 2. Validate before publish

Run:

```bash
aid-doctor check example.com --security-mode balanced --check-downgrade
```

For stricter environments, run:

```bash
aid-doctor check example.com --security-mode strict --check-downgrade
```

Confirm:

- exactly one valid record exists
- remote endpoints use `https://` or `wss://`
- DNSSEC status matches policy
- `pka` verification passes when required

### 3. Publish

- Publish the TXT record at the exact queried host.
- Publish DS records and enable DNSSEC before requiring it in client policy.
- If rotating keys, deploy the new private key before updating DNS.

### 4. Verify after publish

Run:

```bash
aid-doctor check example.com --security-mode balanced --check-downgrade
```

Then run one SDK smoke test from the client environment that will actually consume the record.

### 5. Restore TTL

After caches settle and validation stays clean, restore the normal TTL.

## Security Mode Adoption Ladder

Do not start with `strict` unless DNSSEC and PKA are already operational.

### Stage 1: baseline

Use default discovery behavior while the DNS and app teams prove basic correctness.

Exit criteria:

- exact-host record is stable
- TLS is valid
- no duplicate valid TXT records exist

### Stage 2: `balanced`

Use `balanced` when you want warnings instead of hard failures.

- `pka`: `if-present`
- `dnssec`: `prefer`
- `well-known`: `auto`
- `downgrade`: `warn`

Exit criteria:

- PKA is deployed and verifiable where expected
- DNSSEC is live or the remaining gap is explicitly accepted
- downgrade warnings are monitored

### Stage 3: `strict`

Use `strict` only after the organization can support hard failures.

- `pka`: `require`
- `dnssec`: `require`
- `well-known`: `disable`
- `downgrade`: `fail`

Exit criteria:

- DNSSEC validation works from real client networks
- PKA rotation runbook has been exercised
- teams agree on rollback ownership and escalation path

## Rollback Guidance

Treat rollback as part of the rollout plan.

### DNS rollback

- restore the last known good TXT record
- keep the same queried hostname
- keep TTL low until validation recovers
- rerun `aid-doctor check <domain>`

### PKA rollback

- restore the previous private key only if it is still trusted and available
- otherwise publish a new `pka` with a new `kid`
- do not remove `pka` silently if clients may have downgrade memory enabled

### DNSSEC rollback

- avoid disabling DNSSEC during an incident unless the DNS team is sure DS and signing state are the root cause
- if `strict` clients exist, disabling DNSSEC is a breaking change

## Incident Runbooks

### Downgrade alert: `pka` missing or `kid` changed

1. Confirm whether a planned rotation or rollback happened.
2. Compare the current DNS answer with the last known good value.
3. If the change was expected, document it and update caches or rollout notes.
4. If the change was not expected, treat it as a security incident and revert to a known good state.

### Multiple valid TXT records detected

1. Inspect authoritative DNS, not only recursive resolver output.
2. Remove duplicate valid AID payloads at the queried name.
3. Keep one valid record only.
4. If multiple agents are needed, move them to distinct hostnames.

### Exact-host lookup failed after delegation

1. Confirm the client is querying the intended hostname.
2. Confirm the delegated `_agent` zone exists and serves the target name.
3. Confirm the parent zone does not rely on implicit inheritance.
4. Verify with `dig` and `aid-doctor` from outside the authoritative network.

## Enterprise Checklist

### Before rollout

- [ ] DNS team and app team owners named
- [ ] exact queried hostname agreed
- [ ] rollback owner named
- [ ] TTL lowered for cutover if needed
- [ ] endpoint deployed and TLS valid
- [ ] PKA key pair generated and stored securely if used
- [ ] DNSSEC plan confirmed

### During rollout

- [ ] exactly one valid TXT record published
- [ ] `aid-doctor check <domain>` passes in the target security mode
- [ ] one real SDK/client smoke test passes
- [ ] logs and alerting are monitored during propagation

### After rollout

- [ ] TTL restored
- [ ] rollback notes updated
- [ ] downgrade baseline stored if applicable
- [ ] key rotation procedure documented and assigned

## See Also

- [Specification](../specification.md)
- [Security Best Practices](security.md)
- [Discovery API](discovery_api.md)
- [aid-doctor CLI](../Tooling/aid_doctor.md)
