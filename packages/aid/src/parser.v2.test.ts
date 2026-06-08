import { describe, expect, it } from 'vitest';
import { AidError, AidRecordValidator, parse } from './parser.js';

const VALID_V2_KEY = 'ebVWLo_mVPlAeLES6KmLp5AfhTrmlb7X4OORC60ElmQ';

describe('AID v2 parser', () => {
  it('parses a valid aid2 record without PKA', () => {
    expect(parse('v=aid2;u=https://api.example.com/mcp;p=mcp;a=oauth2_code')).toEqual({
      v: 'aid2',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      auth: 'oauth2_code',
    });
  });

  it('parses aid2 PKA as unpadded base64url JWK x without kid', () => {
    expect(parse(`v=aid2;u=https://api.example.com/mcp;p=mcp;k=${VALID_V2_KEY}`)).toEqual({
      v: 'aid2',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      pka: VALID_V2_KEY,
    });
  });

  it('rejects kid and i on aid2 records', () => {
    expect(() =>
      parse(`v=aid2;u=https://api.example.com/mcp;p=mcp;k=${VALID_V2_KEY};kid=g1`),
    ).toThrow('kid/i is not allowed in aid2 records');

    expect(() =>
      parse(`v=aid2;u=https://api.example.com/mcp;p=mcp;k=${VALID_V2_KEY};i=g1`),
    ).toThrow('kid/i is not allowed in aid2 records');
  });

  it('keeps aid1 PKA kid compatibility', () => {
    const record = parse(
      'v=aid1;u=https://api.example.com/mcp;p=mcp;k=z1111111111111111111111111111111111111111111;i=g1',
    );

    expect(record).toMatchObject({
      v: 'aid1',
      pka: 'z1111111111111111111111111111111111111111111',
      kid: 'g1',
    });
  });

  it('still requires kid for aid1 PKA', () => {
    expect(() =>
      parse(
        'v=aid1;u=https://api.example.com/mcp;p=mcp;k=z1111111111111111111111111111111111111111111',
      ),
    ).toThrow('kid is required when pka is present');
  });

  it.each([
    ['legacy multibase', 'z1111111111111111111111111111111111111111111'],
    ['padded base64url', `${VALID_V2_KEY}=`],
    ['invalid character', `${VALID_V2_KEY.slice(0, -1)}+`],
    ['31 bytes', 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHw'],
    ['33 bytes', 'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAh'],
  ])('rejects invalid aid2 PKA: %s', (_label, key) => {
    expect(() => parse(`v=aid2;u=https://api.example.com/mcp;p=mcp;k=${key}`)).toThrow(AidError);
  });

  it('validates aid2 objects through AidRecordValidator', () => {
    expect(
      AidRecordValidator.validate({
        v: 'aid2',
        uri: 'https://api.example.com/mcp',
        proto: 'mcp',
        pka: VALID_V2_KEY,
      }),
    ).toEqual({
      v: 'aid2',
      uri: 'https://api.example.com/mcp',
      proto: 'mcp',
      pka: VALID_V2_KEY,
    });
  });
});
