import type { ReactNode } from 'react';

type HelpArticleWrapperProps = {
  children: ReactNode;
  metadata?: {
    searchable?: boolean;
    title?: string;
  };
};

/**
 * Replaces the stock Nextra theme wrapper (which renders the theme sidebar,
 * breadcrumb, and TOC through private context providers) with a plain,
 * shell-owned article container. Keeps `data-pagefind-body` so Pagefind
 * indexing behaves exactly as before.
 */
export function HelpArticleWrapper({
  children,
  metadata,
}: HelpArticleWrapperProps) {
  return (
    <article
      className='help-article'
      data-pagefind-body={metadata?.searchable !== false || undefined}
    >
      {children}
    </article>
  );
}
