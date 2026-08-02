import assert from 'node:assert/strict';
import test from 'node:test';
import { containsExactHost, containsExactUrl } from './package-claim-url.mjs';

test('accepts an exact canonical URL in package provenance text', () => {
  assert.equal(
    containsExactUrl('Repository: https://github.com/agentcommunity/agent-identity-discovery', 'https://github.com/agentcommunity/agent-identity-discovery'),
    true,
  );
});

test('rejects prefixed and suffixed attacker URLs in package provenance text', () => {
  const expected = 'https://github.com/agentcommunity/agent-identity-discovery';
  for (const attackerUrl of [
    'https://evil.example/https://github.com/agentcommunity/agent-identity-discovery',
    'https://github.com/agentcommunity/agent-identity-discovery.evil.example',
    'https://github.com/agentcommunity/agent-identity-discovery?redirect=https://evil.example',
  ]) {
    assert.equal(containsExactUrl(`Repository: ${attackerUrl}`, expected), false);
  }
});

test('accepts only an exact agentcommunity.org host', () => {
  assert.equal(containsExactHost('Endpoint: https://agentcommunity.org/mcp', 'agentcommunity.org'), true);
  for (const attackerUrl of [
    'https://evil.example/agentcommunity.org/mcp',
    'https://agentcommunity.org.evil.example/mcp',
    'https://notagentcommunity.org/mcp',
  ]) {
    assert.equal(containsExactHost(`Endpoint: ${attackerUrl}`, 'agentcommunity.org'), false);
  }
});
