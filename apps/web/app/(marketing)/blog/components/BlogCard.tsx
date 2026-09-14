import Image from 'next/image';
import Link from 'next/link';
import { slugifyCategory } from '@/lib/blog/categories';
import type {
  BlogPostSummary,
  ResolvedAuthor,
} from '@/lib/blog/presentation-contracts';

export interface BlogCardProps {
  readonly post: BlogPostSummary;
  readonly author: ResolvedAuthor;
  readonly variant?: 'featured' | 'default';
}

// O64tu / QQ1R4 artwork: M3HZDy paint and each instance’s live text.
const EDITORIAL_ARTWORK: Readonly<
  Record<string, { src: string; headline: string }>
> = {
  'the-suno-playbook-teardown': {
    src: '/images/blog/suno-playbook.svg',
    headline: 'The hard part.',
  }, // GDHzI/gunjT
  'the-contact-problem': {
    src: '/images/blog/contact-problem.svg',
    headline: 'The handoff.',
  }, // MJskE/gunjT
  'the-myspace-problem': {
    src: '/images/blog/myspace-problem.svg',
    headline: 'Build your home.',
  }, // zNtKo/gunjT
  'the-friday-problem': {
    src: '/images/blog/friday-problem.svg',
    headline: 'Before Friday.',
  }, // zI2L5/gunjT
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function BlogCard({ post, author, variant = 'default' }: BlogCardProps) {
  const artwork = EDITORIAL_ARTWORK[post.slug];

  return (
    <article
      className='row-span-3 grid min-w-0 grid-rows-subgrid gap-y-2'
      data-pen-source='O64tu'
      data-variant={variant}
    >
      <Link
        href={`/blog/${post.slug}`}
        className='group row-span-2 grid grid-rows-subgrid gap-y-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token focus-visible:ring-offset-2'
      >
        <div className='relative aspect-video overflow-hidden rounded-lg bg-surface-3'>
          {artwork ? (
            <div
              aria-hidden='true'
              className='relative flex h-full items-center justify-center'
            >
              {/* Canonical gradient artwork contains no text, faces, or album art. */}
              <Image
                src={artwork.src}
                alt=''
                width={384}
                height={216}
                className='absolute inset-0 h-full w-full'
              />
              <span className='relative px-6 text-center text-2xl font-semibold text-white dark:text-white'>
                {artwork.headline}
              </span>
            </div>
          ) : (
            <div
              aria-hidden='true'
              className='flex h-full items-center justify-center p-6 text-center text-xl font-semibold text-primary-token'
            >
              {post.title}
            </div>
          )}
        </div>
        <h2 className='text-xl font-semibold tracking-tight text-primary-token leading-snug'>
          {post.title}
        </h2>
      </Link>
      <div className='flex items-baseline gap-x-2 text-xs text-tertiary-token'>
        {post.category && (
          <>
            <Link
              href={`/blog/category/${slugifyCategory(post.category)}`}
              className='min-w-0 break-words rounded-sm hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token'
            >
              {post.category}
            </Link>
            <span aria-hidden='true'>·</span>
          </>
        )}
        <time className='shrink-0 whitespace-nowrap' dateTime={post.date}>
          {formatDate(post.date)}
        </time>
      </div>
      <span className='sr-only'>By {author.name}</span>
    </article>
  );
}
