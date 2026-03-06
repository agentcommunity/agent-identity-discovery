import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/seo';
import { getAllDocRouteSlugs } from '@/lib/docs';

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();

  const docRoutes = getAllDocRouteSlugs()
    .filter((slug) => slug !== '')
    .map((slug) => ({
      url: `${siteUrl}/docs/${slug}`,
      lastModified: '2026-03-01',
    }));

  return [
    {
      url: `${siteUrl}/`,
      lastModified: '2026-03-04',
    },
    {
      url: `${siteUrl}/workbench`,
      lastModified: '2026-02-26',
    },
    {
      url: `${siteUrl}/docs`,
      lastModified: '2026-03-01',
    },
    ...docRoutes,
  ];
}
