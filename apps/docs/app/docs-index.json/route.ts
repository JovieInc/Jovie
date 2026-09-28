import { loadArticleRegistry } from '@/lib/article-registry.mjs';
import { buildDocsIndex } from '@/lib/help-center-seo.mjs';

// Machine-readable index carrying per-article provenance, last-verified
// state, and canonical product links without cluttering the human UI.
export const dynamic = 'force-static';

export function GET() {
  return Response.json(buildDocsIndex(loadArticleRegistry()));
}
