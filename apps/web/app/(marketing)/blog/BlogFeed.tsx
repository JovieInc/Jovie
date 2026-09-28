import type { ReactNode } from 'react';
import {
  MarketingContainer,
  MarketingEditorialHeroPhoto,
  MarketingHero,
} from '@/components/marketing';
import type {
  BlogPostSummary,
  ResolvedAuthor,
} from '@/lib/blog/presentation-contracts';
import { BlogCard } from './components/BlogCard';

export interface BlogFeedEntry {
  readonly post: BlogPostSummary;
  readonly author: ResolvedAuthor;
}

interface BlogFeedProps {
  readonly entries: readonly BlogFeedEntry[];
}

/** Docked hero shell for /blog: bleeds the editorial photo to y=0 under
 * the transparent-at-top MarketingHeader (marketing routes spec, 2026-09-26). */
function BlogHeroFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className='marketing-hero-dock relative overflow-hidden'>
      <MarketingEditorialHeroPhoto
        src='/images/hero/blog-index.webp'
        opacity={0.4}
        testId='blog-hero-photo'
      />
      <MarketingHero variant='left' className='relative z-10'>
        {children}
      </MarketingHero>
    </div>
  );
}

export function BlogFeed({ entries }: Readonly<BlogFeedProps>) {
  const [featured, ...remaining] = entries;

  if (!featured) {
    return (
      <div className='min-h-screen'>
        <BlogHeroFrame>
          <p className='mb-0 text-sm font-medium text-tertiary-token'>Blog</p>
          <h1 className='system-b-marketing-route-title mb-6 mt-6 max-w-2xl text-primary-token line-clamp-2'>
            Blog
          </h1>
          <p className='max-w-xl text-lg leading-relaxed text-secondary-token'>
            Posts coming soon.
          </p>
        </BlogHeroFrame>
      </div>
    );
  }

  return (
    <div className='min-h-screen'>
      <BlogHeroFrame>
        <p className='mb-0 text-sm font-medium text-tertiary-token'>Blog</p>
        <h1 className='system-b-marketing-route-title mb-6 mt-6 max-w-2xl text-primary-token line-clamp-2'>
          Blog
        </h1>
        <p className='max-w-xl text-lg leading-relaxed text-secondary-token'>
          Thoughts on product, strategy, and the craft of building your Jovie
          profile.
        </p>
      </BlogHeroFrame>

      <MarketingContainer width='page' className='pb-20 sm:pb-28'>
        <div className='marketing-divider mb-10' />

        <div className='mb-10'>
          <BlogCard
            post={featured.post}
            author={featured.author}
            variant='featured'
          />
        </div>

        {remaining.length > 0 && (
          <div className='grid grid-cols-1 gap-8 md:grid-cols-2'>
            {remaining.map(({ post, author }) => (
              <BlogCard key={post.slug} post={post} author={author} />
            ))}
          </div>
        )}
      </MarketingContainer>
    </div>
  );
}
