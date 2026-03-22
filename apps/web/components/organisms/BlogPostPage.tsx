import Link from 'next/link';
import { Avatar } from '@/components/molecules/Avatar';
import { BlogMarkdownReader } from '@/components/molecules/BlogMarkdownReader';
import { Container } from '@/components/site/Container';
import type { BlogPost } from '@/lib/blog/getBlogPosts';
import type { ResolvedAuthor } from '@/lib/blog/resolveAuthor';

export interface BlogPostPageProps {
  readonly post: BlogPost;
  readonly author: ResolvedAuthor;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function BlogPostPage({ post, author }: BlogPostPageProps) {
  return (
    <div className='min-h-screen'>
      {/* Header Section */}
      <Container size='lg' className='pt-16 sm:pt-24 pb-12'>
        <div className='mx-auto max-w-3xl'>
          {/* Back link */}
          <Link
            href='/blog'
            className='inline-flex items-center gap-2 text-sm font-medium text-tertiary-token hover:text-primary-token transition-colors duration-200 mb-10 group'
          >
            <svg
              className='w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1'
              fill='none'
              viewBox='0 0 24 24'
              stroke='currentColor'
              strokeWidth={2}
              aria-hidden='true'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                d='M15 19l-7-7 7-7'
              />
            </svg>
            Back to updates
          </Link>

          {/* Meta info */}
          <div className='flex flex-wrap items-center gap-3 mb-6'>
            <time
              dateTime={post.date}
              className='text-sm font-medium text-tertiary-token tabular-nums'
            >
              {formatDate(post.date)}
            </time>
            {post.category && (
              <>
                <span className='text-quaternary-token'>·</span>
                <span className='text-sm font-medium text-tertiary-token'>
                  {post.category}
                </span>
              </>
            )}
          </div>

          {/* Title */}
          <h1
            className='marketing-h1-linear text-primary-token mb-6'
            data-testid='blog-post-page'
          >
            {post.title}
          </h1>

          {/* Excerpt / Lede */}
          <p className='marketing-lead-linear text-secondary-token mb-10'>
            {post.excerpt}
          </p>

          {/* Author section */}
          <div className='flex items-center gap-4 pb-10 border-b border-border-subtle'>
            <Avatar
              src={author.avatarUrl}
              name={author.name}
              alt={`${author.name} avatar`}
              size='md'
              verified={author.isVerified}
            />
            <div className='flex flex-col'>
              <span className='font-semibold text-primary-token'>
                {author.name}
              </span>
              {author.title && (
                <span className='text-sm text-tertiary-token'>
                  {author.title}
                </span>
              )}
            </div>
            {author.profileUrl && (
              <Link
                href={author.profileUrl}
                className='ml-auto text-sm font-medium text-tertiary-token hover:text-primary-token transition-colors duration-200'
              >
                View profile →
              </Link>
            )}
          </div>
        </div>
      </Container>

      {/* Article Content */}
      <Container size='lg' className='pb-16 sm:pb-24'>
        <div className='mx-auto max-w-3xl'>
          <BlogMarkdownReader html={post.html} />

          {/* Footer */}
          <div className='mt-16 pt-10 border-t border-border-subtle'>
            <Link
              href='/blog'
              className='inline-flex items-center gap-2 text-sm font-medium text-tertiary-token hover:text-primary-token transition-colors duration-200 group'
            >
              <svg
                className='w-4 h-4 transition-transform duration-200 group-hover:-translate-x-1'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
                strokeWidth={2}
                aria-hidden='true'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  d='M15 19l-7-7 7-7'
                />
              </svg>
              Back to updates
            </Link>
          </div>
        </div>
      </Container>
    </div>
  );
}
