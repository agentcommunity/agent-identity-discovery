import { describe, expect, it } from 'vitest';
import { AID_SDK_VERSION, AID_SPEC_VERSION, AID_VERSION } from '@/generated/version';
import { GET } from '@/app/api/version/route';

describe('AID version metadata', () => {
  it('uses the v2 protocol version for public web display', () => {
    expect(AID_SPEC_VERSION).toBe('2.0.0');
    expect(AID_VERSION).toBe(AID_SPEC_VERSION);
    expect(AID_SDK_VERSION).toBe('2.0.0');
  });

  it('returns the spec version from the version API', async () => {
    const response = GET();
    const data = (await response.json()) as {
      version: string;
      specVersion: string;
      sdkVersion: string;
    };

    expect(data).toEqual({
      version: AID_SPEC_VERSION,
      specVersion: AID_SPEC_VERSION,
      sdkVersion: AID_SDK_VERSION,
    });
  });
});
