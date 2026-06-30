import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';

// Note: `export const runtime = 'edge'` is intentionally omitted.
// On Cloudflare Workers the entire Worker runs at the edge — there is no
// separate Node runtime to opt out of. OpenNext (opennextjs-cloudflare) cannot
// bundle edge-runtime-flagged routes into a single Worker bundle; omitting the
// flag lets it bundle the route normally while ImageResponse still works fine.

// Hard caps on untrusted query params. This is a public, unauthenticated
// endpoint and Satori lays text out as glyph paths (roughly superlinear in
// length), so an arbitrarily long ?title=... is a cheap CPU-burn vector that
// also defeats the edge cache via distinct query strings. Clamp before render.
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 200;
const MAX_SLUG = 120;

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const title = (searchParams.get('title') ?? 'Documentation').slice(0, MAX_TITLE);
  const description = (searchParams.get('description') ?? 'Agent Identity & Discovery').slice(
    0,
    MAX_DESCRIPTION,
  );
  // slug is interpolated into the displayed URL string — normalize to the
  // path-safe charset before clamping so it can't break the layout text.
  const slug = (searchParams.get('slug') ?? '')
    .replaceAll(/[^A-Za-z0-9/_-]/g, '')
    .slice(0, MAX_SLUG);

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: '60px 80px',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Top — branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            fontSize: '24px',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: '#a0a0a0',
          }}
        >
          _agent
        </div>
        <div
          style={{
            fontSize: '14px',
            color: '#666',
            borderLeft: '1px solid #333',
            paddingLeft: '12px',
          }}
        >
          Agent Identity &amp; Discovery
        </div>
      </div>

      {/* Center — title + description */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            fontSize: '56px',
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            maxWidth: '900px',
            maxHeight: '260px',
            overflow: 'hidden',
            textOverflow: 'clip',
          }}
        >
          {title}
        </div>
        {description && (
          <div
            style={{
              fontSize: '24px',
              color: '#888',
              lineHeight: 1.4,
              maxWidth: '800px',
              maxHeight: '140px',
              overflow: 'hidden',
              textOverflow: 'clip',
            }}
          >
            {description}
          </div>
        )}
      </div>

      {/* Bottom — URL hint */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: '18px', color: '#555' }}>
          {`aid.agentcommunity.org/docs${slug ? `/${slug}` : ''}`}
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#0196FF' }}>DNS for Agents</div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      headers: {
        // OG images for the same query string are deterministic — cache hard
        // at the edge, modestly in the browser. If the design ever changes,
        // bump the route or add a version query param to bust.
        'Cache-Control': 'public, max-age=86400, s-maxage=31536000',
      },
    },
  );
}
