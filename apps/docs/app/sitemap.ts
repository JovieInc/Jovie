import type { MetadataRoute } from 'next';
import { loadArticleRegistry } from '@/lib/article-registry.mjs';
import { buildSitemapEntries } from '@/lib/help-center-seo.mjs';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemapEntries(loadArticleRegistry());
}
