import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { Badge } from '@/components/ui/Badge';
import { APP_URL } from '@/constants/app';
import { getBlogPosts } from '@/lib/blog/getBlogPosts';

export const metadata = {
  title: 'Jovie Blog',
  description:
    'Signals, playbooks, and product notes for building lasting momentum as an independent artist.',
  alternates: {
    canonical: `${APP_URL}/blog`,
  },
};

export default async function BlogIndexPage() {
  const posts = await getBlogPosts();

  return (
    <Container size='lg' className='py-16 sm:py-20'>
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-12'>
        <header className='space-y-5'>
          <div className='text-xs font-medium uppercase tracking-[0.2em] text-neutral-500'>
            Jovie Blog
          </div>
          <h1 className='text-3xl font-semibold tracking-tight text-neutral-950 sm:text-4xl lg:text-5xl'>
            Strategy, systems, and signals for independent artists.
          </h1>
          <p className='text-lg leading-8 text-neutral-600 sm:text-xl'>
            Thoughtful breakdowns on marketing cadence, release strategy, and
            the infrastructure that turns momentum into a career.
          </p>
        </header>

        <div className='space-y-6'>
          {posts.map(post => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className='group block rounded-2xl border border-neutral-200 p-6 transition hover:border-neutral-300 hover:bg-neutral-50'
            >
              <div className='flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-neutral-500'>
                {post.category && (
                  <Badge
                    emphasis='subtle'
                    className='rounded-full px-3 py-1 text-[11px] tracking-[0.2em]'
                  >
                    {post.category}
                  </Badge>
                )}
                <span>Read the post</span>
              </div>
              <h2 className='mt-4 text-2xl font-semibold tracking-tight text-neutral-950 transition group-hover:text-neutral-900'>
                {post.title}
              </h2>
              <p className='mt-3 text-base leading-7 text-neutral-600'>
                {post.excerpt}
              </p>
              <div className='mt-4 flex flex-wrap items-center gap-2 text-sm text-neutral-500'>
                <span className='font-medium text-neutral-700'>
                  {post.author}
                </span>
                {post.authorTitle && (
                  <>
                    <span className='text-neutral-300'>•</span>
                    <span>{post.authorTitle}</span>
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </Container>
  );
}
