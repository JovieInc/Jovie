import { loadArticleRegistry } from '@/lib/article-registry.mjs';
import { buildLlmsTxt } from '@/lib/help-center-seo.mjs';

// Agent-facing index generated from the same certified registry as
// navigation, search, and the sitemap. Never a second authored copy.
export const dynamic = 'force-static';

export function GET() {
  return new Response(buildLlmsTxt(loadArticleRegistry()), {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
