import Link from 'next/link';
import { Container } from '@/components/site/Container';
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
    <Container size='lg' className='py-16 sm:py-24'>
      <div className='mx-auto flex w-full max-w-3xl flex-col gap-16'>
        <header className='space-y-6'>
          <div className='text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400'>
            Blog
          </div>
          <h1 className='text-4xl font-bold tracking-tight text-neutral-950 sm:text-5xl lg:text-6xl'>
            Strategy, systems, and signals for independent artists.
          </h1>
          <p className='text-lg leading-8 text-neutral-600 sm:text-xl sm:leading-9'>
            Thoughtful breakdowns on marketing cadence, release strategy, and
            the infrastructure that turns momentum into a career.
          </p>
        </header>

        <div className='space-y-8'>
          {posts.map(post => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className='group block rounded-lg bg-white p-8 shadow-sm ring-1 ring-neutral-950/5 transition hover:shadow-md hover:ring-neutral-950/10'
            >
              <div className='flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.15em] text-neutral-400'>
                {post.category && (
                  <span className='rounded-md bg-neutral-950/5 px-2.5 py-1 text-[11px] tracking-[0.15em]'>
                    {post.category}
                  </span>
                )}
              </div>
              <h2 className='mt-5 text-2xl font-bold tracking-tight text-neutral-950 transition sm:text-3xl'>
                {post.title}
              </h2>
              <p className='mt-4 text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8'>
                {post.excerpt}
              </p>
              <div className='mt-5 flex flex-wrap items-center gap-2 text-sm text-neutral-500'>
                <span className='font-semibold text-neutral-900'>
                  {post.author}
                </span>
                {post.authorTitle && (
                  <>
                    <span className='text-neutral-300'>·</span>
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
