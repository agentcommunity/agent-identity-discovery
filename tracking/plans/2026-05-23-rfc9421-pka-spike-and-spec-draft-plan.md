# Superseded RFC 9421 PKA Spike Plan

**Status:** Superseded for execution.
**Date:** 2026-05-23

This file originally planned a disposable RFC 9421 spike using signed HTTP `Date` plus an `AID-Challenge` request header.

That shape is no longer the recommended AID v2 PKA profile.

Use these files instead:

- Current source of truth: `/Users/team/dev/PROJECTS/AgentCommunity/AID/.worktrees/aid-v2-spec-plan/tracking/plans/2026-05-07-aid-v2-spec-plan.md`
- Accepted no-date spike result: `/Users/team/dev/PROJECTS/AgentCommunity/AID/.worktrees/aid-v2-spec-plan/tracking/spikes/2026-05-23-rfc9421-pka-no-date-respike-results.md`

Current direction:

- No signed HTTP `Date`.
- Client challenge carried in RFC 9421 `nonce`.
- Prefer RFC 9421 `Accept-Signature` for response-signature challenge transport, pending exact Structured Fields validation.
- Mandatory `created` and `expires`.
- PKA response `Cache-Control: no-store`.
- Derived `keyid` from DNS `k` using the RFC 7638 JWK thumbprint.
