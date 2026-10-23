import type { ReactNode } from 'react';
import { MarketingHero } from '@/components/marketing';
import { MarketingContentShell } from '@/components/marketing/MarketingContentShell';
import type { BlogCategory } from '@/lib/blog/categories';

interface BlogCategoryContentProps {
  readonly category: BlogCategory;
  readonly hasPosts: boolean;
  readonly children?: ReactNode;
}

export function BlogCategoryContent({
  category,
  hasPosts,
  children,
}: Readonly<BlogCategoryContentProps>) {
  return (
    <div className='min-h-screen'>
      <MarketingHero
        variant='left'
        testId='marketing-section-hero'
        sectionVariant='left-none'
        sectionOwner='apps/web/components/organisms/BlogCategoryContent.tsx'
      >
        <p className='marketing-kicker mb-0 text-tertiary-token'>Blog</p>
        <h1 className='marketing-h1-linear text-balance mb-6 mt-6 text-primary-token'>
          {category.name}
        </h1>
        <p className='marketing-lead-linear max-w-[34rem] text-secondary-token'>
          {category.description}
        </p>
      </MarketingHero>

      <MarketingContentShell width='page'>
        <section
          aria-label={`${category.name} posts`}
          data-testid='marketing-section-blog-feed'
          data-marketing-variant='category-filtered-grid'
          data-marketing-owner='apps/web/components/organisms/BlogCategoryContent.tsx'
        >
          <div className='marketing-divider mb-10' />
          {hasPosts ? (
            <div className='grid grid-cols-1 gap-8 md:grid-cols-2'>
              {children}
            </div>
          ) : (
            <p className='text-secondary-token'>
              No posts in this category yet.
            </p>
          )}
        </section>
      </MarketingContentShell>
    </div>
  );
}
