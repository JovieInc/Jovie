import Link from 'next/link';
import { MarketingContainer } from '@/components/marketing/MarketingContainer';
import type { BlogFeedEntry } from '../BlogFeed';
import { BlogCard } from './BlogCard';

export interface BlogEditorialRowProps {
  readonly entries: readonly BlogFeedEntry[];
}

/** Static editorial preview: no client fetch, carousel, or synthetic entries. */
export function BlogEditorialRow({ entries }: BlogEditorialRowProps) {
  if (entries.length === 0) return null;

  return (
    <section
      aria-labelledby='latest-news-heading'
      className='py-16 sm:py-24'
      data-marketing-owner='apps/web/app/(marketing)/blog/components/BlogEditorialRow.tsx'
      data-marketing-variant='editorial-four'
      data-testid='marketing-section-blog-feed'
    >
      <MarketingContainer width='page'>
        <div className='mb-8 flex flex-wrap items-baseline justify-between gap-4'>
          <h2
            id='latest-news-heading'
            className='text-2xl font-semibold tracking-tight text-primary-token'
          >
            Latest News
          </h2>
          <Link
            href='/blog'
            className='relative rounded-sm text-sm text-secondary-token hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2'
          >
            All posts
          </Link>
        </div>
        <div className='grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 xl:grid-cols-4'>
          {entries.slice(0, 4).map(({ post, author }) => (
            <BlogCard
              key={post.slug}
              post={post}
              author={author}
              variant='editorial'
            />
          ))}
        </div>
      </MarketingContainer>
    </section>
  );
}
