import { describe, expect, it } from 'vitest';
import { validateGeneratorPayload } from '@/lib/api/generator-validation';

describe('generator validation', () => {
  it('accepts a valid v2 payload', () => {
    const result = validateGeneratorPayload({
      domain: 'example.com',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      auth: 'pat',
      desc: 'Primary endpoint',
      docs: 'https://docs.example.com/agent',
      dep: '2026-01-01T00:00:00Z',
      pka: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
    });

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.txt).toContain('v=aid2');
    expect(result.txt).toContain('u=https://api.example.com/mcp');
    expect(result.txt).toContain('p=mcp');
    expect(result.bytes.desc).toBeLessThanOrEqual(60);
  });

  it('always emits canonical short-key TXT output', () => {
    const result = validateGeneratorPayload({
      domain: 'example.com',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      auth: 'pat',
      desc: 'Primary endpoint',
    });

    expect(result.success).toBe(true);
    expect(result.txt).toBe('v=aid2;u=https://api.example.com/mcp;p=mcp;a=pat;s=Primary endpoint');
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

  it('rejects legacy PKA encodings', () => {
    const result = validateGeneratorPayload({
      domain: 'example.com',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      pka: 'z1234',
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((error) => error.code === 'ERR_PKA_FORMAT')).toBe(true);
  });

  it('rejects kid in v2 output', () => {
    const result = validateGeneratorPayload({
      domain: 'example.com',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      pka: 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
      kid: 'g1',
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((error) => error.code === 'ERR_KID_NOT_ALLOWED')).toBe(true);
  });
});
