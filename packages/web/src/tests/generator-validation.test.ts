import { describe, expect, it } from 'vitest';
import { validateGeneratorPayload } from '@/lib/api/generator-validation';

describe('generator validation', () => {
  it('accepts a valid v1.1 payload', () => {
    const result = validateGeneratorPayload({
      domain: 'example.com',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      auth: 'pat',
      desc: 'Primary endpoint',
      docs: 'https://docs.example.com/agent',
      dep: '2026-01-01T00:00:00Z',
      pka: 'z7rW8rTq8o4mM6vVf7w1k3m4uQn9p2YxCAbcDeFgHiJ',
      kid: 'g1',
      useAliases: true,
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.txt).toContain('v=aid1');
    expect(result.txt).toContain('u=https://api.example.com/mcp');
    expect(result.txt).toContain('p=mcp');
    expect(result.bytes.desc).toBeLessThanOrEqual(60);
  });

  it('always emits canonical short-key TXT output even when full-key mode is requested', () => {
    const result = validateGeneratorPayload({
      domain: 'example.com',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      auth: 'pat',
      desc: 'Primary endpoint',
      useAliases: false,
    });

    expect(result.success).toBe(true);
    expect(result.txt).toBe('v=aid1;u=https://api.example.com/mcp;p=mcp;a=pat;s=Primary endpoint');
    expect(result.suggestAliases).toBe(true);
  });

  it('rejects docs links that are not https', () => {
    const result = validateGeneratorPayload({
      domain: 'example.com',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      auth: 'pat',
      desc: 'Example',
      docs: 'http://docs.example.com/agent',
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((error) => error.code === 'ERR_DOCS_HTTPS')).toBe(true);
  });

  it('rejects websocket records with non-wss URIs', () => {
    const result = validateGeneratorPayload({
      domain: 'example.com',
      uri: 'https://api.example.com/ws',
      proto: 'websocket',
      desc: 'Example',
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((error) => error.code === 'ERR_URI_SCHEME')).toBe(true);
  });

  it('requires kid when pka is present', () => {
    const result = validateGeneratorPayload({
      domain: 'example.com',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      pka: 'z1234',
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((error) => error.code === 'ERR_KID_REQUIRED')).toBe(true);
  });
});
