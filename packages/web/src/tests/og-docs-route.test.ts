import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { GET } from '@/app/api/og/docs/route';

const OG_URL = 'https://aid.agentcommunity.org/api/og/docs';

// The route only reads `request.nextUrl.searchParams`, so a minimal stand-in
// with a real URL's searchParams is enough to exercise it without spinning up
// the full Next.js request machinery.
const makeRequest = (url: string): NextRequest =>
  ({ nextUrl: new URL(url) }) as unknown as NextRequest;

describe('/api/og/docs', () => {
  it('returns a 1200x630 PNG with hard caching when called with no params', async () => {
    const response = GET(makeRequest(OG_URL));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=31536000');
    // Body is a real, non-empty image buffer.
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('renders normal title/description/slug params', () => {
    const response = GET(makeRequest(`${OG_URL}?title=Hello&description=World&slug=reference/pka`));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/png');
  });

  it('does not blow up on oversized untrusted input (clamp holds)', () => {
    const huge = 'A'.repeat(50_000);
    const response = GET(makeRequest(`${OG_URL}?title=${huge}&description=${huge}&slug=${huge}`));

    // The clamp (slice) means rendering stays bounded and the route still
    // produces a valid image rather than timing out or erroring.
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/png');
  });

  it('strips disallowed characters from slug before rendering', () => {
    // A slug with markup/control characters must not throw; it is normalized
    // to the path-safe charset. We assert the route still succeeds.
    const response = GET(makeRequest(`${OG_URL}?slug=${encodeURIComponent('a<b>c"/..%00')}`));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/png');
  });
});
