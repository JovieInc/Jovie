import Link from 'next/link';
import { Avatar } from '@/components/molecules/Avatar';
import type { BlogPostSummary } from '@/lib/blog/getBlogPosts';
import type { ResolvedAuthor } from '@/lib/blog/resolveAuthor';
import { CategoryPill } from './CategoryPill';

export interface BlogCardProps {
  readonly post: BlogPostSummary;
  readonly author: ResolvedAuthor;
  readonly variant?: 'featured' | 'default';
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function BlogCard({ post, author, variant = 'default' }: BlogCardProps) {
  if (variant === 'featured') {
    return (
      <article className='group rounded-2xl border border-border-subtle p-8 sm:p-10 transition-[border-color,transform] duration-200 hover:border-border-default hover:-translate-y-0.5'>
        {/* Meta — category pill outside the link to avoid nested <a> */}
        <div className='flex flex-wrap items-center gap-3 mb-4'>
          <time
            dateTime={post.date}
            className='text-sm font-medium text-tertiary-token tabular-nums'
          >
            {formatDate(post.date)}
          </time>
          <span className='text-quaternary-token'>·</span>
          <span className='text-sm text-tertiary-token'>
            {post.readingTime} min read
          </span>
          {post.category && (
            <>
              <span className='text-quaternary-token'>·</span>
              <CategoryPill category={post.category} />
            </>
          )}
        </div>

        <Link
          href={`/blog/${post.slug}`}
          className='block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token rounded-lg'
        >
          {/* Title */}
          <h2 className='text-2xl sm:text-3xl font-semibold tracking-tight text-primary-token mb-4 group-hover:text-primary-token transition-colors'>
            {post.title}
          </h2>

          {/* Excerpt */}
          <p className='text-lg leading-relaxed text-secondary-token mb-6 line-clamp-3'>
            {post.excerpt}
          </p>

          {/* Author */}
          <div className='flex items-center gap-3'>
            <Avatar
              src={author.avatarUrl}
              name={author.name}
              alt={`${author.name} avatar`}
              size='sm'
              verified={author.isVerified}
            />
            <div className='flex items-center gap-2 text-sm'>
              <span className='font-medium text-primary-token'>
                {author.name}
              </span>
              {author.title && (
                <>
                  <span className='text-quaternary-token'>·</span>
                  <span className='text-tertiary-token'>{author.title}</span>
                </>
              )}
            </div>
          </div>
        </Link>
      </article>
    );
  }

  return (
    <article className='group rounded-xl border border-border-subtle p-6 h-full transition-[border-color,transform] duration-200 hover:border-border-default hover:-translate-y-0.5'>
      {/* Meta */}
      <div className='flex flex-wrap items-center gap-2 mb-3'>
        <time
          dateTime={post.date}
          className='text-sm font-medium text-tertiary-token tabular-nums'
        >
          {formatDate(post.date)}
        </time>
        <span className='text-quaternary-token'>·</span>
        <span className='text-sm text-tertiary-token'>
          {post.readingTime} min read
        </span>
      </div>

      {/* Category — outside the link to avoid nested <a> */}
      {post.category && (
        <div className='mb-3'>
          <CategoryPill category={post.category} />
        </div>
      )}

      <Link
        href={`/blog/${post.slug}`}
        className='block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token rounded-lg'
      >
        {/* Title */}
        <h2 className='text-lg sm:text-xl font-semibold tracking-tight text-primary-token mb-3 group-hover:text-primary-token transition-colors'>
          {post.title}
        </h2>

        {/* Excerpt */}
        <p className='text-base leading-relaxed text-secondary-token line-clamp-2 mb-4'>
          {post.excerpt}
        </p>

        {/* Author */}
        <div className='flex items-center gap-2 text-sm'>
          <Avatar
            src={author.avatarUrl}
            name={author.name}
            alt={`${author.name} avatar`}
            size='xs'
            verified={author.isVerified}
          />
          <span className='font-medium text-primary-token'>{author.name}</span>
        </div>
      </Link>
    </article>
  );
}
