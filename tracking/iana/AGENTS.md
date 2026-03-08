# AGENTS.md

Nearest-agent instructions for files under `tracking/iana/`.

## Scope

This directory contains IANA and Internet-Draft working material for AID.
Use the root `AGENTS.md` plus the rules below.

## Canonical sources

- Protocol source of truth: `protocol/constants.yml`
- Normative prose source: `packages/docs/specification.md`
- Generated canonical module: `protocol/spec.ts`
- Web mirror: `packages/web/src/generated/spec.ts`
- Current deployed web version boundary: `packages/web/src/spec-adapters/index.ts`

Do not invent protocol fields, registry entries, or security behavior in `tracking/iana/`.
Pull them from the sources above.

## Internet-Draft XML rules

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

Preferred validation order:

1. XML well-formedness
2. `xml2rfc` local render
3. IETF Author Tools or Datatracker validation

Useful local command:

```bash
xml2rfc --cache .tmp-xml2rfc-cache --text tracking/iana/draft-nemethi-aid-agent-identity-discovery-00.xml
```

## Environment hygiene

- Do not add global Python tooling requirements to the repo root for I-D work.
- If `xml2rfc` is unavailable, prefer a temporary workspace-local virtualenv and delete it after validation.
- Do not modify SDK or root packaging files just to validate the draft.

## Content style

- Keep IANA requests narrowly scoped and protocol-specific.
- Preserve the distinction between the RFC 8552 `_agent` node-name request and the RFC 6335 `agent` service-name-only request.
- Keep `_agent` label stability explicit across future record-type evolution.
- State that `_agent._<proto>.<domain>` names are subordinate names beneath `_agent`.

## Future cleanup

- See `tracking/iana/TODO_SINGLE_SOURCE_WORKFLOW.md` before introducing any new hand-maintained duplication between the docs spec and the Internet-Draft XML.
