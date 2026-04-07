# AGENTS.md

Nearest-agent instructions for files under `tracking/iana/`.

## Scope

This directory contains IANA evidence and operational material for AID. The Internet-Draft XML source no longer lives here — it moved to a dedicated repository at [`agentcommunity/draft-nemethi-aid-agent-identity-discovery`](https://github.com/agentcommunity/draft-nemethi-aid-agent-identity-discovery). See `DRAFT_REPO.md` for the pointer. Edits to the draft should happen in that repo, not this directory. Use the root `AGENTS.md` plus the rules below.

## Canonical sources

- Protocol source of truth: `protocol/constants.yml`
- Normative prose source: `packages/docs/specification.md`
- Generated canonical module: `protocol/spec.ts`
- Web mirror: `packages/web/src/generated/spec.ts`
- Current deployed web version boundary: `packages/web/src/spec-adapters/index.ts`

Do not invent protocol fields, registry entries, or security behavior in `tracking/iana/`.
Pull them from the sources above.

## Internet-Draft XML rules (for the separate draft repo)

These rules apply to the XML source in the separate [`agentcommunity/draft-nemethi-aid-agent-identity-discovery`](https://github.com/agentcommunity/draft-nemethi-aid-agent-identity-discovery) repo, not to this directory.

- Use current RFCXML v3, not legacy v2.
- Follow the current IETF template model with `version="3"` and `xml:lang="en"`.
- Include `<?xml-model href="rfc7991bis.rnc"?>` at the top of the XML source.
- Keep `docName`, `<seriesInfo name="Internet-Draft" .../>`, and filename identical.
- Include the required I-D content: Abstract, Introduction, Security Considerations, IANA Considerations, References.
- Let xml2rfc generate "Status of This Memo", "Copyright Notice", and authors' addresses from front matter.
- Avoid reserved anchor prefixes such as `section-`, `table-`, `figure-`, `u-`, and `iref-`.
- Prefer narrow tables or lists. Wide tables create text-rendering warnings.
- For long DNS TXT examples, prefer valid multi-string zone-file form using parentheses.

## Validation workflow

Validation and `xml2rfc` rendering happens in the draft repo's CI pipeline (`martinthomson/i-d-template` toolchain). Do not attempt to validate a copy of the XML from this monorepo — there is no copy to validate. If you need to check rendering, clone the draft repo and run `make` there.

## Content style

- Keep IANA requests narrowly scoped and protocol-specific.
- Preserve the distinction between the RFC 8552 `_agent` node-name request and the RFC 6335 `agent` service-name-only request.
- Keep `_agent` label stability explicit across future record-type evolution.
- State that `_agent._<proto>.<domain>` names are subordinate names beneath `_agent`.

## Future cleanup

- See `tracking/iana/TODO_SINGLE_SOURCE_WORKFLOW.md` before introducing any new hand-maintained duplication between the docs spec and the Internet-Draft XML.
