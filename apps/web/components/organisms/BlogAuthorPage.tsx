import type { ReactNode } from 'react';
import { MarketingContainer } from '@/components/marketing';

export interface BlogAuthorPageProps {
  readonly articleCount: number;
  readonly authorHero: ReactNode;
  readonly articleCards: ReactNode;
}

/**
 * Presentation-only body for the public blog author route.
 * Route params, content/profile loading, metadata, schemas, and notFound stay
 * in the server route.
 */
export function BlogAuthorPage({
  articleCount,
  authorHero,
  articleCards,
}: Readonly<BlogAuthorPageProps>) {
  return (
    <div className='min-h-screen' data-testid='blog-author-page'>
      <MarketingContainer width='page' className='pb-12 pt-16 sm:pt-24'>
        <div className='mx-auto max-w-3xl'>{authorHero}</div>
      </MarketingContainer>

      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <div className='marketing-divider mb-10' />
        <h2 className='mb-8 text-xl font-semibold tracking-tight text-primary-token'>
          {articleCount === 1 ? '1 article' : `${articleCount} articles`}
        </h2>
        <div className='grid grid-cols-1 gap-8 md:grid-cols-2'>
          {articleCards}
        </div>
      </MarketingContainer>
    </div>
  );
}
