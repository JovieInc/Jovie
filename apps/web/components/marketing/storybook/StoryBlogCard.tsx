import Link from 'next/link';
import type { StoryBlogPost } from './fixtures';

/**
 * Storybook-only blog card. Avoids importing the production BlogCard, which
 * transitively pulls node:fs via `@/lib/blog/getBlogPosts`.
 */
export function StoryBlogCard({
  post,
  variant = 'default',
}: Readonly<{
  post: StoryBlogPost;
  variant?: 'featured' | 'default';
}>) {
  const isFeatured = variant === 'featured';
  return (
    <article
      className={
        isFeatured
          ? 'rounded-2xl border border-subtle bg-surface-1 p-8 sm:p-10'
          : 'h-full rounded-xl border border-subtle bg-surface-1 p-6'
      }
    >
      <div className='mb-3 flex flex-wrap items-center gap-2 text-sm text-tertiary-token'>
        <time dateTime={post.date} className='font-medium tabular-nums'>
          {post.date}
        </time>
        <span aria-hidden='true'>·</span>
        <span>{post.readingTime} min read</span>
        <span aria-hidden='true'>·</span>
        <span className='text-secondary-token'>{post.category}</span>
      </div>
      <Link
        href={`/blog/${post.slug}`}
        className='block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token'
      >
        <h2
          className={
            isFeatured
              ? 'mb-4 text-2xl font-semibold tracking-tight text-primary-token sm:text-3xl'
              : 'mb-3 text-lg font-semibold tracking-tight text-primary-token sm:text-xl'
          }
        >
          {post.title}
        </h2>
        <p
          className={
            isFeatured
              ? 'mb-6 line-clamp-3 text-lg leading-relaxed text-secondary-token'
              : 'mb-4 line-clamp-2 text-base leading-relaxed text-secondary-token'
          }
        >
          {post.excerpt}
        </p>
        <p className='text-sm font-medium text-primary-token'>{post.author}</p>
      </Link>
    </article>
  );
}
