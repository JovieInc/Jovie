import Link from 'next/link';
import { Container } from '@/components/site/Container';
import { APP_URL } from '@/constants/app';
import { getBlogPosts } from '@/lib/blog/getBlogPosts';

// Fully static - blog posts are read from filesystem at build time
export const revalidate = false;

export const metadata = {
  title: 'Jovie Blog',
  description:
    'Signals, playbooks, and product notes for building lasting momentum as an independent artist.',
  alternates: {
    canonical: `${APP_URL}/blog`,
  },
};

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function BlogIndexPage() {
  const posts = await getBlogPosts();

  return (
    <div className='min-h-screen'>
      {/* Hero Section */}
      <div className='relative overflow-hidden'>
        {/* Subtle gradient background */}
        <div className='absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-bg-base' />

        <Container size='lg' className='relative py-20 sm:py-28 lg:py-32'>
          <div className='mx-auto max-w-3xl text-center'>
            <p
              className='text-sm font-medium tracking-widest uppercase mb-4'
              style={{ color: 'var(--linear-text-tertiary)' }}
            >
              Updates
            </p>
            <h1
              className='marketing-h1-linear mb-6'
              style={{ color: 'var(--linear-text-primary)' }}
            >
              Now
            </h1>
            <p
              className='marketing-lead-linear max-w-2xl mx-auto'
              style={{ color: 'var(--linear-text-secondary)' }}
            >
              Thoughts on product, strategy, and the craft of building tools for
              artists.
            </p>
          </div>
        </Container>
      </div>

      {/* Posts Timeline */}
      <Container size='lg' className='pb-20 sm:pb-28'>
        <div className='mx-auto max-w-3xl'>
          <div className='space-y-0'>
            {posts.map((post, index) => (
              <article key={post.slug} className='group relative'>
                {/* Timeline connector */}
                {index < posts.length - 1 && (
                  <div
                    className='absolute left-[7px] top-[2.5rem] bottom-0 w-px'
                    style={{ backgroundColor: 'var(--linear-border-subtle)' }}
                  />
                )}

                <Link
                  href={`/blog/${post.slug}`}
                  className='block py-8 -mx-4 px-4 sm:-mx-6 sm:px-6 rounded-xl transition-all duration-200'
                >
                  <div className='flex gap-6 sm:gap-8'>
                    {/* Timeline dot */}
                    <div className='relative flex-shrink-0 pt-1.5'>
                      <div
                        className='w-[15px] h-[15px] rounded-full border-2 transition-colors duration-200'
                        style={{
                          borderColor: 'var(--linear-border-default)',
                          backgroundColor: 'var(--linear-bg-page)',
                        }}
                      />
                    </div>

                    {/* Content */}
                    <div className='flex-1 min-w-0'>
                      {/* Date and category */}
                      <div className='flex items-center gap-3 mb-3'>
                        <time
                          dateTime={post.date}
                          className='text-sm font-medium tabular-nums'
                          style={{ color: 'var(--linear-text-tertiary)' }}
                        >
                          {formatDate(post.date)}
                        </time>
                        {post.category && (
                          <>
                            <span
                              style={{ color: 'var(--linear-text-tertiary)' }}
                            >
                              ·
                            </span>
                            <span
                              style={{ color: 'var(--linear-text-tertiary)' }}
                            >
                              {post.category}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Title */}
                      <h2
                        className='text-xl sm:text-2xl font-semibold tracking-tight mb-3 transition-colors'
                        style={{ color: 'var(--linear-text-primary)' }}
                      >
                        {post.title}
                      </h2>

                      {/* Excerpt */}
                      <p
                        className='text-base leading-relaxed line-clamp-2'
                        style={{ color: 'var(--linear-text-secondary)' }}
                      >
                        {post.excerpt}
                      </p>

                      {/* Author */}
                      <div className='mt-4 flex items-center gap-2 text-sm'>
                        <span
                          className='font-medium'
                          style={{ color: 'var(--linear-text-primary)' }}
                        >
                          {post.author}
                        </span>
                        {post.authorTitle && (
                          <>
                            <span
                              style={{ color: 'var(--linear-text-tertiary)' }}
                            >
                              ·
                            </span>
                            <span
                              style={{ color: 'var(--linear-text-tertiary)' }}
                            >
                              {post.authorTitle}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Arrow indicator */}
                    <div className='flex-shrink-0 pt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200'>
                      <svg
                        className='w-5 h-5'
                        fill='none'
                        viewBox='0 0 24 24'
                        stroke='currentColor'
                        strokeWidth={2}
                        aria-hidden='true'
                      >
                        <path
                          strokeLinecap='round'
                          strokeLinejoin='round'
                          d='M9 5l7 7-7 7'
                        />
                      </svg>
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}
