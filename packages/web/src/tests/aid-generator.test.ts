import { describe, it, expect } from 'vitest';
import { buildTxtRecord, validateTxt, type AidGeneratorData } from '@/lib/aid-generator';

describe('AID generator', () => {
  it('builds alias record including v1.1 fields', () => {
    const data: AidGeneratorData = {
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      auth: 'pat',
      desc: 'Example',
      domain: 'example.com',
      docs: 'https://docs.example.com/agent',
      dep: '2026-01-01T00:00:00Z',
      pka: 'z1234',
      kid: 'g1',
    };
    const txt = buildTxtRecord(data);
    expect(txt).toContain('v=aid1');
    expect(txt).toContain('u=https://api.example.com/mcp');
    expect(txt).toContain('p=mcp');
    expect(txt).toContain('a=pat');
    expect(txt).toContain('s=Example');
    expect(txt).toContain('d=https://docs.example.com/agent');
    expect(txt).toContain('e=2026-01-01T00:00:00Z');
    expect(txt).toContain('k=z1234');
    expect(txt).toContain('i=g1');
  });

  it('validates required fields and version', () => {
    const ok = validateTxt('v=aid1;u=https://api.example.com;p=mcp') as {
      isValid: boolean;
      error?: string;
    };
    expect(ok.isValid).toBe(true);
    const bad = validateTxt('u=https://api.example.com;p=mcp') as {
      isValid: boolean;
      error?: string;
    };
    expect(bad.isValid).toBe(false);
  });
});
