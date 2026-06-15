import { describe, expect, it } from 'vitest';
import { parse } from '@agentcommunity/aid';
import { GET } from '@/app/.well-known/agent/route';

// wellknown-aid1-1: the dogfood well-known record must be a valid aid2 document,
// not the legacy aid1 it previously served.

describe('GET /.well-known/agent', () => {
  it('serves an aid2 record that round-trips through the SDK parser', async () => {
    const res = GET();
    expect(res.status).toBe(200);

    const json = (await res.json()) as Record<string, string>;
    expect(json.v).toBe('aid2');

    // Build the canonical TXT string from the served key-aliased object and
    // assert the SDK parses it as aid2 (this also validates pka/uri/proto).
    const txt = Object.entries(json)
      .map(([k, v]) => `${k}=${v}`)
      .join(';');
    const record = parse(txt);

    expect(record.v).toBe('aid2');
    expect(record.proto).toBe('mcp');
    expect(record.uri).toBe('https://aid.agentcommunity.org/api/pka-demo');
    // The key set should include the pka-basic showcase key so the record
    // round-trips through the v2 PKA handshake.
    expect(record.pka).toBe('Eesj9h7MD0cRERrc_ICXu5Lb1WkokpkbWAkRcDsxUvA');
  });
});
