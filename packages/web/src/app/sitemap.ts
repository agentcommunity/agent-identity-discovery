import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/seo';
import { getAllDocRouteSlugs } from '@/lib/docs';

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const docRoutes = getAllDocRouteSlugs()
    .filter((slug) => slug !== '')
    .map((slug) => ({
      url: `${siteUrl}/docs/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
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
    {
      url: `${siteUrl}/docs`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...docRoutes,
  ];
}
