# Contributing to the AID Specification

The spec is **contract-first**. All protocol constants and types live in a single YAML file (`protocol/constants.yml`). Generator scripts transform that YAML into language-specific constant modules and typings.

## Proposing a Change

1. Fork the repo and create a branch.
2. Edit **`protocol/constants.yml`** – follow alphabetical order, update the `schemaVersion` if the change is breaking.
3. Run `pnpm gen` to regenerate code.
4. Commit **both** the YAML change **and** the generated artifacts in the same commit.
5. If the change is user-visible (new token, renamed field, removed constant), run `pnpm changeset` and commit the generated `.changeset/*.md` file.
6. If the change touches any file under `packages/docs/**`, run `pnpm docs:verify` and commit the regenerated `packages/docs/export-manifest.json` and `packages/docs/export-manifest.sha256`. The `CI (Docs Authority)` check enforces these stay in sync.
7. Open a PR and describe the rationale.

## Adding a New Token

• Add the new token under the correct section in the YAML, keeping keys sorted for clean diffs.
• Provide a short descriptive comment.

## Validation

CI will fail if:

- Generated files differ from committed versions (`pnpm gen` must be run and the results committed).
- The docs export manifest is out of sync with the docs source files (run `pnpm docs:verify`).

Note: alphabetical order of token keys in the YAML is a style convention enforced by the generator on output (sorted keys are emitted regardless of YAML order). Unsorted YAML input will not itself fail CI, but keeping the YAML sorted makes diffs cleaner.

## Code Style

Generated files are formatted automatically. Do not hand-edit generated files; edit the YAML instead.
