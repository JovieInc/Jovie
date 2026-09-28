import Link from 'next/link';
import { loadArticleRegistry } from '@/lib/article-registry.mjs';

type RegistryArticle = {
  id: string;
  route: string;
  title: string;
  description: string;
};

type HelpRelatedGuidesProps = {
  /** The current article's frontmatter `id`, used for automatic fallback. */
  articleId: string;
  /**
   * Explicit related article IDs. Only certified, primary articles resolve;
   * at most three render.
   */
  ids?: string[];
};

export function HelpRelatedGuides({ articleId, ids }: HelpRelatedGuidesProps) {
  const { consumers } = loadArticleRegistry();
  let related: RegistryArticle[];
  if (ids?.length) {
    const primaryById = new Map<string, RegistryArticle>(
      (consumers.navigation as RegistryArticle[]).map(article => [
        article.id,
        article,
      ])
    );
    related = ids
      .map(id => primaryById.get(id))
      .filter((article): article is RegistryArticle => Boolean(article));
  } else {
    related = consumers.related(articleId) as RegistryArticle[];
  }
  related = related.slice(0, 3);
  if (related.length === 0) return null;

  return (
    <nav
      className='help-section help-related'
      aria-labelledby='related-guides'
      data-help-related=''
    >
      <h2 id='related-guides'>Related guides</h2>
      <ul>
        {related.map(article => (
          <li key={article.id}>
            <Link href={article.route}>{article.title}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
