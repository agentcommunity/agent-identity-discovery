# TODO: Single-Source Spec and Internet-Draft Workflow

## Status

Not for today. This is a future cleanup task for the next agent or maintainer.

**Update 2026-04-07:** The Internet-Draft XML has since moved out of this monorepo and into a dedicated repository at [`agentcommunity/draft-nemethi-aid-agent-identity-discovery`](https://github.com/agentcommunity/draft-nemethi-aid-agent-identity-discovery). The two-place drift problem described below still applies — the paths are just different now.

## Problem

Right now the normative AID content exists in two hand-maintained forms:

- `packages/docs/specification.md` (this repo)
- `draft-nemethi-aid-agent-identity-discovery.xml` (in the separate draft repo)

Even when both are aligned, this is brittle. Normative drift can happen easily.

## Why this matters

- The docs site wants Markdown.
- IETF submission wants RFCXML v3 as the authoritative draft source.
- Maintaining both by hand increases the chance of subtle divergence in normative language.

## Recommended direction

Move to a single-source workflow.

Best likely path:

1. Create one canonical I-D-friendly source file.
2. Generate RFCXML from that source.
3. Generate human review renderings (`txt`, `html`) from the RFCXML toolchain.
4. Either:
   - generate the docs-site version from that same source, or
   - generate a docs-friendly derivative from the canonical source.

## Important constraint

Do not assume the current `packages/docs/specification.md` can be safely converted directly into a clean Internet-Draft without work.

Reasons:

- It is docs-site Markdown, not RFC-aware Markdown.
- It includes frontmatter and site-specific conventions.
- A generic Markdown to XML conversion may not preserve exact normative structure.

## Strong candidate approaches

### Option A

Canonical source is RFC-aware Markdown, for example `kramdown-rfc`.

- Source: one RFC-aware `.md` file
- Outputs: `.xml`, `.txt`, `.html`, and optionally site Markdown

This is probably the best long-term balance.

### Option B

Canonical source is RFCXML.

- Source: one `.xml` file
- Outputs: `.txt`, `.html`
- Docs site content is derived separately from XML or maintained as a downstream render

This is safer for IETF precision, but less pleasant for general editing.

## Suggested future location for canonical source

Prefer a neutral source location, not one tied only to the docs site or only to tracking.

Examples:

- `protocol/ietf/draft-aid.md`
- `protocol/ietf/draft-aid.xml`

Then treat `tracking/iana/` as submission packaging, not the long-term authoring home.

## Minimum future deliverable

The next agent tackling this should produce:

- one canonical source
- one reproducible generation command
- generated XML committed to the draft repo (`agentcommunity/draft-nemethi-aid-agent-identity-discovery`)
- generated review outputs (`txt` and optionally `html`) via that repo's CI pipeline
- updated instructions in `tracking/iana/AGENTS.md` and the draft repo's AGENTS.md (if any)

## Success criterion

After this cleanup, normative text should be edited in exactly one place.
