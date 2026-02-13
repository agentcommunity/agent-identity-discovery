import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { getDocBySlug, getAllDocSlugs } from '@/lib/docs';
import { mdxComponents } from '@/components/docs/mdx-components';
import { AiToolbar } from '@/components/docs/ai-toolbar';
import { Toc } from '@/components/docs/toc';
import { DocsFooter } from '@/components/docs/docs-footer';

interface PageProps {
  params: Promise<{ slug?: string[] }>;
}

export function generateStaticParams() {
  const slugs = getAllDocSlugs();
  return [
    { slug: undefined }, // /docs index
    ...slugs.filter((s) => s !== 'index').map((s) => ({ slug: s.split('/') })),
  ];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug: slugParts } = await params;
  const slug = slugParts?.join('/') ?? 'index';
  const doc = getDocBySlug(slug);
  if (!doc) return {};

  const ogSlug = slug === 'index' ? '' : slug;
  const ogUrl = `/api/og/docs?title=${encodeURIComponent(doc.title)}&description=${encodeURIComponent(doc.description)}&slug=${encodeURIComponent(ogSlug)}`;

  return {
    title: doc.title,
    description: doc.description,
    alternates: { canonical: `/docs${slug === 'index' ? '' : `/${slug}`}` },
    openGraph: {
      title: doc.title,
      description: doc.description,
      images: [{ url: ogUrl, width: 1200, height: 630, alt: doc.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: doc.title,
      description: doc.description,
      images: [ogUrl],
    },
  };
}

export default async function DocPage({ params }: PageProps) {
  const { slug: slugParts } = await params;
  const slug = slugParts?.join('/') ?? 'index';
  const doc = getDocBySlug(slug);

  if (!doc) notFound();

  return (
    <div className="flex">
      {/* Article */}
      <article
        className="flex-1 min-w-0 max-w-3xl mx-auto px-6 py-8 lg:px-8"
        itemScope
        itemType="https://schema.org/TechArticle"
      >
        <meta itemProp="name" content={doc.title} />
        <meta itemProp="description" content={doc.description} />

        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">{doc.title}</h1>
        {doc.description && <p className="text-lg text-muted-foreground mb-6">{doc.description}</p>}

        <AiToolbar slug={slug} rawContent={doc.rawContent} />

        <div className="docs-prose">
          <MDXRemote
            source={doc.content}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkGfm],
                rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings, { behavior: 'wrap' }]],
              },
            }}
            components={mdxComponents}
          />
        </div>

        <DocsFooter />
      </article>

      {/* TOC — right sidebar on desktop */}
      <aside className="hidden xl:block w-56 flex-shrink-0 py-8 pr-4">
        <div className="sticky top-6">
          <Toc headings={doc.headings} />
        </div>
      </aside>
    </div>
  );
}
