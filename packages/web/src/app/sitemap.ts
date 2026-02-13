import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/seo';
import { getAllDocSlugs } from '@/lib/docs';

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const docRoutes = getAllDocSlugs().map((slug) => ({
    url: `${siteUrl}/docs/${slug === 'index' ? '' : slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: slug === 'index' ? 0.9 : 0.7,
  }));

  return [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/workbench`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...docRoutes,
  ];
}
