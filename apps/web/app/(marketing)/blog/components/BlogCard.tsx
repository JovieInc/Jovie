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
  readonly variant?: 'featured' | 'default' | 'editorial';
}

// O64tu / QQ1R4 artwork: M3HZDy paint and each instance’s live text.
const EDITORIAL_HEADLINES: Readonly<Record<string, string>> = {
  'the-suno-playbook-teardown': 'The hard part.', // GDHzI/gunjT
  'the-contact-problem': 'The handoff.', // MJskE/gunjT
  'the-myspace-problem': 'Build your home.', // zNtKo/gunjT
  'the-friday-problem': 'Before Friday.', // zI2L5/gunjT
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
  const artworkHeadline = EDITORIAL_HEADLINES[post.slug];
  const titleId = `blog-card-title-${post.slug}`;
  const editorial = variant === 'editorial';
  const Heading = editorial ? 'h3' : 'h2';

  return (
    <article
      className={
        editorial
          ? 'min-w-0'
          : 'row-span-3 grid min-w-0 grid-rows-subgrid gap-y-2'
      }
      data-pen-source='O64tu'
      data-variant={variant}
    >
      <Link
        href={`/blog/${post.slug}`}
        aria-labelledby={titleId}
        className={
          editorial
            ? 'group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token focus-visible:ring-offset-2'
            : 'group row-span-2 grid grid-rows-subgrid gap-y-4 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token focus-visible:ring-offset-2'
        }
      >
        <div className='relative aspect-video overflow-hidden rounded-lg bg-surface-3'>
          {post.image ? (
            <div className='relative flex h-full items-center justify-center'>
              {/* Canonical gradient artwork contains no text, faces, or album art. */}
              <Image
                src={post.image}
                alt={post.imageAlt ?? ''}
                width={384}
                height={216}
                className='absolute inset-0 h-full w-full'
              />
              {artworkHeadline && (
                <span
                  aria-hidden='true'
                  className='relative px-6 text-center text-2xl font-semibold text-white dark:text-white'
                >
                  {artworkHeadline}
                </span>
              )}
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
        {editorial && (
          <div className='mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-tertiary-token'>
            {post.category && (
              <>
                <span>{post.category}</span>
                <span aria-hidden='true'>·</span>
              </>
            )}
            <time dateTime={post.date}>{formatDate(post.date)}</time>
          </div>
        )}
        <Heading
          id={titleId}
          data-wrap='editorial-title'
          className={
            editorial
              ? 'mt-2 text-lg font-semibold tracking-tight text-primary-token leading-snug break-words'
              : 'text-xl font-semibold tracking-tight text-primary-token leading-snug'
          }
        >
          {post.title}
        </Heading>
      </Link>
      {!editorial && (
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
      )}
      <span className='sr-only'>By {author.name}</span>
    </article>
  );
}
