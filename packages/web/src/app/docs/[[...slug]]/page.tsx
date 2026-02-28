import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { getDocBySlug, getAllDocSlugs } from '@/lib/docs';
import { getSiteUrl } from '@/lib/seo';
import { mdxComponents } from '@/components/docs/mdx-components';
import { AiToolbar } from '@/components/docs/ai-toolbar';
import { Toc } from '@/components/docs/toc';
import { TocMobile } from '@/components/docs/toc-mobile';
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

function buildJsonLd(slug: string, title: string, description: string) {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/docs${slug === 'index' ? '' : `/${slug}`}`;

  const base: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    name: title,
    description,
    url: pageUrl,
    inLanguage: 'en-US',
    author: { '@type': 'Organization', name: 'Agent Community', url: 'https://agentcommunity.org' },
    publisher: {
      '@type': 'Organization',
      name: 'Agent Community',
      url: 'https://agentcommunity.org',
      logo: { '@type': 'ImageObject', url: `${siteUrl}/logo/agent.png` },
    },
    isPartOf: { '@type': 'WebSite', name: 'Agent Identity & Discovery', url: siteUrl },
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
  };

  if (slug === 'specification') {
    Object.assign(base, {
      proficiencyLevel: 'Expert',
      datePublished: '2026-02-06',
      dateModified: '2026-02-06',
      version: '1.2.0',
      keywords: [
        'AID protocol',
        'agent discovery',
        'DNS TXT record',
        'MCP',
        'A2A',
        'agent identity',
        'PKA',
        'Ed25519',
      ],
      about: {
        '@type': 'Thing',
        name: 'Agent Identity & Discovery Protocol',
        description:
          'DNS-first agent bootstrap standard for discovering AI agent services via TXT records.',
      },
    });
  }

  return base;
}

export default async function DocPage({ params }: PageProps) {
  const { slug: slugParts } = await params;
  const slug = slugParts?.join('/') ?? 'index';
  const doc = getDocBySlug(slug);

  if (!doc) notFound();

  const jsonLd = buildJsonLd(slug, doc.title, doc.description);

  return (
    <div className="flex">
      <script
        type="application/ld+json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Article */}
      <article
        className="flex-1 min-w-0 max-w-5xl mx-auto px-6 py-8 lg:px-8"
        itemScope
        itemType="https://schema.org/TechArticle"
      >
        <meta itemProp="name" content={doc.title} />
        <meta itemProp="description" content={doc.description} />

        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">{doc.title}</h1>
        {doc.description && <p className="text-lg text-muted-foreground mb-6">{doc.description}</p>}

        <AiToolbar slug={slug} rawContent={doc.rawContent} />

        <TocMobile headings={doc.headings} />

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
