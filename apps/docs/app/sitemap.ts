import type { MetadataRoute } from 'next';
import { loadArticleRegistry } from '@/lib/article-registry.mjs';

const DOCS_ORIGIN = 'https://docs.jov.ie';

export default function sitemap(): MetadataRoute.Sitemap {
  const { consumers } = loadArticleRegistry();
  return consumers.sitemap.map((article: { route: string }) => ({
    url: new URL(article.route, DOCS_ORIGIN).toString(),
  }));
}
