import { NextResponse } from 'next/server';

/**
 * Dogfood: serve our own AID well-known fallback.
 *
 * Returns the well-known JSON for aid.agentcommunity.org so the site
 * practices what it preaches. The primary record lives in DNS TXT
 * (`_agent.aid.agentcommunity.org`), but this provides the HTTP fallback
 * as described in the spec.
 */
export function GET() {
  return NextResponse.json(
    {
      v: 'aid2',
      p: 'mcp',
      u: 'https://aid.agentcommunity.org/api/pka-demo',
      s: 'AID Workbench — Agent Identity Discovery',
      d: 'https://aid.agentcommunity.org/docs',
      // pka-basic showcase key (matches /api/pka-demo, which signs tag="aid-pka-v2").
      k: 'Eesj9h7MD0cRERrc_ICXu5Lb1WkokpkbWAkRcDsxUvA',
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    },
  );
}
