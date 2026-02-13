import { NextRequest, NextResponse } from 'next/server';
import { getDocBySlug } from '@/lib/docs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const slugStr = slug.join('/');
  const doc = getDocBySlug(slugStr);

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const format = request.nextUrl.searchParams.get('format');

  if (format === 'json') {
    return NextResponse.json({
      title: doc.title,
      description: doc.description,
      content: doc.rawContent,
      headings: doc.headings,
    });
  }

  return new NextResponse(doc.rawContent, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
