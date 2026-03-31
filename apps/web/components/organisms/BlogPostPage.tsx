import Link from 'next/link';
import { BlogAuthorCard } from '@/app/(marketing)/blog/components/BlogAuthorCard';
import { BlogRelatedPosts } from '@/app/(marketing)/blog/components/BlogRelatedPosts';
import { BlogTableOfContents } from '@/app/(marketing)/blog/components/BlogTableOfContents';
import { CategoryPill } from '@/app/(marketing)/blog/components/CategoryPill';
import { Avatar } from '@/components/molecules/Avatar';
import { BlogMarkdownReader } from '@/components/molecules/BlogMarkdownReader';
import { Container } from '@/components/site/Container';
import type { BlogPost, BlogPostSummary } from '@/lib/blog/getBlogPosts';
import type { ResolvedAuthor } from '@/lib/blog/resolveAuthor';
import type { TocEntry } from '@/types/docs';

export interface BlogPostPageProps {
  readonly post: BlogPost;
  readonly author: ResolvedAuthor;
  readonly toc: TocEntry[];
  readonly relatedPosts: BlogPostSummary[];
  readonly relatedAuthors: Map<string, ResolvedAuthor>;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function BlogPostPage({
  post,
  author,
  toc,
  relatedPosts,
  relatedAuthors,
}: BlogPostPageProps) {
  return (
    <article className='min-h-screen'>
      {/* Header Section */}
      <Container size='lg' className='pt-16 sm:pt-24 pb-12'>
        <div className='mx-auto max-w-4xl'>
          {/* Back link */}
          <Link
            href='/blog'
            className='inline-flex items-center gap-2 text-sm font-medium text-tertiary-token hover:text-primary-token transition-colors duration-200 mb-10 group'
          >
            <svg
              className='w-4 h-4 transition-[transform,translate] duration-200 group-hover:-translate-x-1'
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
            Blog
          </Link>

          {/* Meta info */}
          <div className='flex flex-wrap items-center gap-3 mb-6'>
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

          {/* Title */}
          <h1
            className='marketing-h1-linear text-primary-token mb-6 max-w-3xl'
            data-testid='blog-post-page'
          >
            {post.title}
          </h1>

          {/* Excerpt / Lede */}
          <p className='marketing-lead-linear text-secondary-token mb-10 max-w-3xl'>
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
              {author.profileUrl ? (
                <Link
                  href={author.profileUrl}
                  className='font-semibold text-primary-token hover:underline underline-offset-4'
                >
                  {author.name}
                </Link>
              ) : (
                <span className='font-semibold text-primary-token'>
                  {author.name}
                </span>
              )}
              {author.title && (
                <span className='text-sm text-tertiary-token'>
                  {author.title}
                </span>
              )}
            </div>
          </div>
        </div>
      </Container>

      {/* Article Content + TOC Sidebar */}
      <Container size='lg' className='pb-16 sm:pb-24'>
        <div className='mx-auto max-w-4xl'>
          <div className='grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-12'>
            {/* Main content */}
            <div className='min-w-0'>
              <BlogMarkdownReader html={post.html} />
            </div>

            {/* TOC Sidebar */}
            <BlogTableOfContents toc={toc} />
          </div>

          {/* Author Card */}
          <div className='mt-16 pt-10 border-t border-border-subtle'>
            <BlogAuthorCard author={author} variant='inline' />
          </div>

          {/* Related Posts */}
          {relatedPosts.length > 0 && (
            <div className='mt-12'>
              <BlogRelatedPosts posts={relatedPosts} authors={relatedAuthors} />
            </div>
          )}
        </div>
      </Container>
    </article>
  );
}
