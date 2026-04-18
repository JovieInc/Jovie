import Link from 'next/link';
import { Avatar } from '@/components/molecules/Avatar';
import type { ResolvedAuthor } from '@/lib/blog/resolveAuthor';

export interface BlogAuthorCardProps {
  readonly author: ResolvedAuthor;
  readonly variant?: 'inline' | 'hero';
}

export function BlogAuthorCard({
  author,
  variant = 'inline',
}: BlogAuthorCardProps) {
  if (variant === 'hero') {
    return (
      <div className='flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8'>
        <Avatar
          src={author.avatarUrl}
          name={author.name}
          alt={`${author.name} avatar`}
          size='xl'
          verified={author.isVerified}
        />
        <div className='flex flex-col items-center sm:items-start'>
          <h1 className='text-3xl sm:text-4xl font-semibold tracking-tight text-primary-token'>
            {author.name}
          </h1>
          {author.title && (
            <p className='mt-2 text-lg text-secondary-token'>{author.title}</p>
          )}
          {author.bio && (
            <p className='mt-3 text-base text-tertiary-token max-w-lg leading-relaxed'>
              {author.bio}
            </p>
          )}
          {author.profileUrl && (
            <Link
              href={author.profileUrl}
              className='mt-4 text-sm font-medium text-tertiary-token hover:text-primary-token transition-colors duration-200'
            >
              View profile →
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6 p-6 rounded-xl border border-border-subtle bg-surface-1'>
      <Avatar
        src={author.avatarUrl}
        name={author.name}
        alt={`${author.name} avatar`}
        size='lg'
        verified={author.isVerified}
      />
      <div className='flex flex-col flex-1 min-w-0'>
        <span className='font-semibold text-primary-token text-lg'>
          {author.name}
        </span>
        {author.title && (
          <span className='text-sm text-tertiary-token mt-0.5'>
            {author.title}
          </span>
        )}
        {author.bio && (
          <p className='text-sm text-secondary-token mt-2 line-clamp-2 leading-relaxed'>
            {author.bio}
          </p>
        )}
      </div>
      {author.profileUrl && (
        <Link
          href={author.profileUrl}
          className='text-sm font-medium text-tertiary-token hover:text-primary-token transition-colors duration-200 whitespace-nowrap self-start sm:self-center'
        >
          View profile →
        </Link>
      )}
    </div>
  );
}
