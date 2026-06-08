import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDiscover = vi.hoisted(() => vi.fn());

vi.mock('@agentcommunity/aid', () => {
  class AidError extends Error {
    errorCode: string;
    code: number;

    constructor(errorCode: string, message: string) {
      super(message);
      this.errorCode = errorCode;
      this.code = 1000;
    }
  }

  return {
    AidError,
    discover: mockDiscover,
  };
});

import { discover } from '@agentcommunity/aid';
import { runProtocolProbe } from './protoProbe';

describe('runProtocolProbe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the protocol owner suffix to discover so the SDK queries the exact proto name', async () => {
    const raw = 'v=aid2;u=https://api.example.com/mcp;p=mcp';
    mockDiscover.mockResolvedValueOnce({
      raw,
      ttl: 300,
    });

    const result = await runProtocolProbe('example.com', 'mcp', 123);

    expect(discover).toHaveBeenCalledWith('_mcp.example.com', {
      timeout: 123,
      wellKnownFallback: false,
    });
    expect(result.attempt).toEqual({
      name: '_agent._mcp.example.com',
      type: 'TXT',
      result: 'NOERROR',
      ttl: 300,
      byteLength: new TextEncoder().encode(raw).length,
    });
  });
});
