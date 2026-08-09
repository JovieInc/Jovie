import { MarketingContainer, MarketingHero } from '@/components/marketing';
import type { BlogPostSummary } from '@/lib/blog/getBlogPosts';
import type { ResolvedAuthor } from '@/lib/blog/resolveAuthor';
import { BlogCard } from './components/BlogCard';

export interface BlogFeedEntry {
  readonly post: BlogPostSummary;
  readonly author: ResolvedAuthor;
}

interface BlogFeedProps {
  readonly entries: readonly BlogFeedEntry[];
}

export function BlogFeed({ entries }: Readonly<BlogFeedProps>) {
  const [featured, ...remaining] = entries;

  if (!featured) {
    return (
      <div className='min-h-screen'>
        <MarketingHero variant='left'>
          <p className='mb-0 text-sm font-medium text-tertiary-token'>Blog</p>
          <h1 className='mb-6 mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl'>
            Blog
          </h1>
          <p className='max-w-xl text-lg leading-relaxed text-secondary-token'>
            Posts coming soon.
          </p>
        </MarketingHero>
      </div>
    );
  }

  return (
    <div className='min-h-screen'>
      <MarketingHero variant='left'>
        <p className='mb-0 text-sm font-medium text-tertiary-token'>Blog</p>
        <h1 className='mb-6 mt-6 max-w-2xl text-4xl font-semibold tracking-tight text-balance text-primary-token sm:text-5xl'>
          Blog
        </h1>
        <p className='max-w-xl text-lg leading-relaxed text-secondary-token'>
          Thoughts on product, strategy, and the craft of building tools for
          artists.
        </p>
      </MarketingHero>

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
