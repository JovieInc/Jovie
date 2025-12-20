import Link from 'next/link';
import { Avatar } from '@/components/atoms/Avatar';
import { BlogMarkdownReader } from '@/components/molecules/BlogMarkdownReader';
import { Container } from '@/components/site/Container';
import { Badge } from '@/components/ui/Badge';
import type { BlogPost } from '@/lib/blog/getBlogPosts';
import { cn } from '@/lib/utils';

export interface BlogPostPageProps {
  post: BlogPost;
}

export function BlogPostPage({ post }: BlogPostPageProps) {
  return (
    <Container size='lg' className='py-16 sm:py-20'>
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-12'>
        <div className='space-y-6' data-testid='blog-post-page'>
          <div className='flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-neutral-500'>
            {post.category && (
              <Badge
                emphasis='subtle'
                className='rounded-full px-3 py-1 text-[11px] tracking-[0.2em]'
              >
                {post.category}
              </Badge>
            )}
            <span>Jovie Blog</span>
          </div>
          <h1 className='text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl lg:text-5xl'>
            {post.title}
          </h1>
          <p className='text-lg leading-8 text-neutral-600 sm:text-xl'>
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
                <span className='font-medium text-neutral-900'>
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
                  'text-sm font-medium text-neutral-900 underline underline-offset-4 decoration-neutral-300 transition hover:decoration-neutral-500'
                )}
              >
                View profile
              </Link>
            )}
          </div>
        </div>
        <div className='border-t border-neutral-200 pt-10'>
          <BlogMarkdownReader html={post.html} />
        </div>
        <div className='border-t border-neutral-200 pt-8'>
          <Link
            href='/blog'
            className='text-sm font-medium text-neutral-600 underline underline-offset-4 decoration-neutral-300 transition hover:text-neutral-900 hover:decoration-neutral-500'
          >
            Back to the blog
          </Link>
        </div>
      </div>
    </Container>
  );
}
