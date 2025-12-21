import Link from 'next/link';
import { Avatar } from '@/components/atoms/Avatar';
import { BlogMarkdownReader } from '@/components/molecules/BlogMarkdownReader';
import { Container } from '@/components/site/Container';
import type { BlogPost } from '@/lib/blog/getBlogPosts';
import { cn } from '@/lib/utils';

export interface BlogPostPageProps {
  post: BlogPost;
}

export function BlogPostPage({ post }: BlogPostPageProps) {
  return (
    <Container size='lg' className='py-16 sm:py-24'>
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-16'>
        <div className='space-y-8' data-testid='blog-post-page'>
          <div className='flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400'>
            {post.category && (
              <span className='rounded-md bg-neutral-950/5 px-2.5 py-1 text-[11px] tracking-[0.15em]'>
                {post.category}
              </span>
            )}
          </div>
          <h1 className='text-4xl font-bold tracking-tight text-neutral-950 sm:text-5xl lg:text-6xl'>
            {post.title}
          </h1>
          <p className='text-lg leading-8 text-neutral-600 sm:text-xl sm:leading-9'>
            {post.excerpt}
          </p>
          <div className='flex flex-wrap items-center gap-4 text-sm text-neutral-500'>
            <div className='flex items-center gap-3'>
              <Avatar
                name={post.author}
                alt={`${post.author} avatar`}
                size='sm'
              />
              <div className='flex flex-col'>
                <span className='font-semibold text-neutral-900'>
                  {post.author}
                </span>
                {post.authorTitle && (
                  <span className='text-sm text-neutral-500'>
                    {post.authorTitle}
                  </span>
                )}
              </div>
            </div>
            {post.authorProfile && (
              <Link
                href={post.authorProfile}
                className={cn(
                  'text-sm font-semibold text-neutral-900 underline underline-offset-4 decoration-neutral-300 transition hover:decoration-neutral-600'
                )}
              >
                View profile
              </Link>
            )}
          </div>
        </div>
        <div className='border-t border-neutral-950/5 pt-12'>
          <BlogMarkdownReader html={post.html} />
        </div>
        <div className='border-t border-neutral-950/5 pt-10'>
          <Link
            href='/blog'
            className='text-sm font-semibold text-neutral-600 underline underline-offset-4 decoration-neutral-300 transition hover:text-neutral-900 hover:decoration-neutral-600'
          >
            ← Back to blog
          </Link>
        </div>
      </div>
    </Container>
  );
}
