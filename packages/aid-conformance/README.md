# @agentcommunity/aid-conformance

# Agent Identity & Discovery

> DNS for agents

AID as the public address book for the agentic web.

It's a simple, open standard that uses the internet's own directory—DNS—to answer one question: **"Given a domain, where is its AI agent, and how do I know it's the real one?"**

No more hunting through API docs. No more manual configuration. It's the zero-friction layer for a world of interconnected agents.

Built by the team at [agentcommunity.org](https://agentcommunity.org).

- **Website**: [aid.agentcommunity.org](https://aid.agentcommunity.org)
- **Docs**: [docs.agentcommunity.org/aid](https://docs.agentcommunity.org/aid)
- **GitHub**: [github.com/agent-community/agent-identity-discovery](https://github.com/agent-community/agent-identity-discovery)

Exposes the shared fixture packs via typed exports:

- `golden.json` for parser parity across languages
- `enterprise.json` for enterprise discovery and security vectors used by the reference implementation

It also provides a simple Node runner to execute the parser fixtures against a parser.

## Install

```bash
pnpm add -D @agentcommunity/aid-conformance
# or
npm i -D @agentcommunity/aid-conformance
```

## Usage (Node / TypeScript)

```ts
import { fixtures, enterpriseFixtures, type GoldenFixture } from '@agentcommunity/aid-conformance';
import { parse } from '@agentcommunity/aid';

for (const c of fixtures.records) {
  const record = parse(c.raw);
  // assert deep equality with c.expected
}

for (const c of enterpriseFixtures.securityPolicies) {
  console.log(c.name, c.runtime);
}
```

To use from other language repos, consume the published package tarball as a dev artifact or copy the JSON path after installation:

- The JSON is reused from the repo at `test-fixtures/golden.json` and `test-fixtures/enterprise.json` and is included in the published bundle (no duplication in source).

## CLI

Run the built-in runner with the shared fixtures (default) or a custom file path:

```bash
# default fixtures
npx aid-conformance

# custom fixture
npx aid-conformance ./some-fixture.json
```

Exit code is non-zero if any case fails. Output includes a concise summary.

### v1.1 Notes

- Fixtures now contain records exercising v1.1 additions:
  - `docs` (https URL), `dep` (ISO 8601 Z)
  - `pka`/`kid` presence (parsing only — handshake is out of scope for fixtures)

## Development

- Build: `pnpm build`
- Test: `pnpm test`
- Lint: `pnpm lint`

## License

MIT © [Agent Community](https://agentcommunity.org)
