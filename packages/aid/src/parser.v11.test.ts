import { describe, it, expect } from 'vitest';
import { parse, AidError } from './parser.js';

describe('AID Parser v1.1 extensions', () => {
  it('accepts aliases for uri and proto', () => {
    const txt = 'v=aid1;u=https://api.example.com/mcp;p=mcp';
    const rec = parse(txt);
    expect(rec.v).toBe('aid1');
    expect(rec.uri).toBe('https://api.example.com/mcp');
    expect(rec.proto).toBe('mcp');
  });

  it('accepts long-key compatibility for version/proto', () => {
    const txt = 'version=aid1;u=https://api.example.com/mcp;proto=mcp';
    const rec = parse(txt);
    expect(rec.v).toBe('aid1');
    expect(rec.proto).toBe('mcp');
  });

  it('rejects version+v duplicates', () => {
    const dup = 'version=aid1;v=aid1;u=https://api.example.com/mcp;p=mcp';
    expect(() => parse(dup)).toThrow(AidError);
    expect(() => parse(dup)).toThrow('Cannot specify both "version" and "v" fields');
  });

  it('rejects alias+full duplicates (uri+u)', () => {
    const dup = 'v=aid1;uri=https://api.example.com/mcp;u=https://api.example.com/mcp;p=mcp';
    expect(() => parse(dup)).toThrow(AidError);
    expect(() => parse(dup)).toThrow('Cannot specify both "uri" and "u"');
  });

  it('validates docs as https URL', () => {
    const bad = 'v=aid1;u=https://api.example.com/mcp;p=mcp;d=http://docs.example.com';
    expect(() => parse(bad)).toThrow(AidError);
    expect(() => parse(bad)).toThrow('docs MUST be an absolute https:// URL');
  });

  it('validates dep as ISO 8601 UTC (Z)', () => {
    const bad = 'v=aid1;u=https://api.example.com/mcp;p=mcp;e=2026-01-01T00:00:00';
    expect(() => parse(bad)).toThrow(AidError);
    expect(() => parse(bad)).toThrow('dep MUST be an ISO 8601 UTC timestamp');
  });

  it('enforces websocket wss:// scheme', () => {
    const ok = 'v=aid1;u=wss://ws.example.com;p=websocket';
    expect(() => parse(ok)).not.toThrow();
    const bad = 'v=aid1;u=https://ws.example.com;p=websocket';
    expect(() => parse(bad)).toThrow(AidError);
  });

  it('enforces zeroconf: scheme', () => {
    const ok = 'v=aid1;u=zeroconf:_mcp._tcp;p=zeroconf';
    expect(() => parse(ok)).not.toThrow();
    const bad = 'v=aid1;u=_mcp._tcp;p=zeroconf';
    expect(() => parse(bad)).toThrow(AidError);
  });

  it('requires kid when pka is present', () => {
    const bad = 'v=aid1;u=https://api.example.com/mcp;p=mcp;k=zBase58PublicKeyOnly';
    expect(() => parse(bad)).toThrow(AidError);
    expect(() => parse(bad)).toThrow('kid is required when pka is present');
  });
});
