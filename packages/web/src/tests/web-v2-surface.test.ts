import { describe, expect, it } from 'vitest';
import {
  OTHER_CHAT_EXAMPLES,
  PROTOCOL_EXAMPLES,
  REAL_WORLD_EXAMPLES,
  REFERENCE_EXAMPLES,
  TUTORIAL_EXAMPLES,
  type Example,
} from '@/generated/examples';
import { scenarios } from '@/lib/scenarios';
import { buildTxtRecord, parseRecordString } from '@/lib/generator/core';

const allExamples: Example[] = [
  ...TUTORIAL_EXAMPLES,
  ...REFERENCE_EXAMPLES,
  ...REAL_WORLD_EXAMPLES,
  ...PROTOCOL_EXAMPLES,
  ...OTHER_CHAT_EXAMPLES,
];

const parseFields = (record: string): Map<string, string> =>
  new Map(
    record
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');
        return [part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1).trim()];
      }),
  );

describe('web AID v2 surface', () => {
  it('ships only aid2 generated examples without legacy key identifiers', () => {
    expect(allExamples.length).toBeGreaterThan(0);

    for (const example of allExamples) {
      const fields = parseFields(example.content);
      expect(fields.get('v'), example.domain).toBe('aid2');
      expect(fields.has('i'), example.domain).toBe(false);
      expect(fields.has('kid'), example.domain).toBe(false);
      expect(example.domain.startsWith('v2-'), example.domain).toBe(false);
    }
  });

  it('uses aid2 records in built-in resolver scenarios', () => {
    for (const [domain, scenario] of Object.entries(scenarios)) {
      const discovery = scenario.discovery as
        | {
            ok: true;
            value: {
              record: { v?: string };
              metadata?: { txtRecord?: string };
            };
          }
        | { ok: false }
        | undefined;

      if (!discovery || discovery.ok === false) continue;

      expect(discovery.value.record.v, domain).toBe('aid2');
      if (discovery.value.metadata?.txtRecord) {
        const fields = parseFields(discovery.value.metadata.txtRecord);
        expect(fields.get('v'), domain).toBe('aid2');
        expect(fields.has('i'), domain).toBe(false);
        expect(fields.has('kid'), domain).toBe(false);
      }
    }
  });

  it('does not rehydrate legacy kid/i into creator state or TXT output', () => {
    const parsed = parseRecordString(
      'v=aid2;u=https://api.example.com/mcp;p=mcp;k=ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ;i=legacy;kid=legacy',
    );

    expect(parsed).not.toHaveProperty('kid');
    expect(
      buildTxtRecord({
        domain: 'example.com',
        uri: parsed.uri ?? '',
        proto: parsed.proto ?? '',
        auth: '',
        desc: '',
        docs: '',
        dep: '',
        pka: parsed.pka ?? '',
      }),
    ).toBe(
      'v=aid2;u=https://api.example.com/mcp;p=mcp;k=ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ',
    );
  });
});
