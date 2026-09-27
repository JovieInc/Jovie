import type { ReactNode } from 'react';
import { loadArticleRegistry } from '@/lib/article-registry.mjs';

type HelpArticleProps = {
  /** Must match the article's frontmatter `id`. */
  id: string;
  children: ReactNode;
};

/**
 * Canonical article wrapper. Exposes stable data hooks so metadata, analytics,
 * search indexing, and screenshot certification can bind to the article
 * without ad hoc markup.
 */
type RegistryArticle = {
  id: string;
  documentType?: string;
  category?: string;
  status?: string;
};

export function HelpArticle({ id, children }: HelpArticleProps) {
  const { articles } = loadArticleRegistry();
  const article = (articles as unknown as RegistryArticle[]).find(
    entry => entry.id === id
  );

  return (
    <article
      className='help-article'
      data-help-article=''
      data-article-id={id}
      data-document-type={article?.documentType}
      data-category={article?.category}
      data-status={article?.status}
    >
      {children}
    </article>
  );
}
