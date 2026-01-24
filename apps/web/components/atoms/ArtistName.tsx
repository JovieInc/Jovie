import Link from 'next/link';
import type { ElementType } from 'react';
import { VerifiedBadge } from '@/components/atoms/VerifiedBadge';
import { cn } from '@/lib/utils';

/**
 * Renders an artist's name with an optional verification badge.
 *
 * Defaults to an `h1` for page-level headings. Use the `as` prop to
 * render inline elements like `span` when the name appears within other
 * content blocks.
 */

interface ArtistNameProps {
  name: string;
  handle: string;
  isVerified?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showLink?: boolean;
  className?: string;
  as?: ElementType;
}

const sizeClasses = {
  sm: 'text-lg sm:text-xl',
  md: 'text-xl sm:text-2xl',
  lg: 'text-2xl sm:text-3xl',
  xl: 'text-3xl sm:text-4xl',
};

const badgeSizes = {
  sm: 'sm' as const,
  md: 'sm' as const,
  lg: 'sm' as const,
  xl: 'md' as const,
};

export function ArtistName({
  name,
  handle,
  isVerified = false,
  size = 'lg',
  showLink = true,
  className,
  as: Tag = 'h1',
}: ArtistNameProps) {
  const content = (
    <span className='inline-flex items-start justify-center gap-1.5'>
      <span
        className={cn(
          'font-semibold text-gray-900 dark:text-white',
          showLink &&
            'hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer',
          className
        )}
      >
        {name}
      </span>
      {isVerified && (
        <span className='relative -top-[0.5em] -left-[0.25em]'>
          <VerifiedBadge
            size={badgeSizes[size]}
            className='text-indigo-600 dark:text-indigo-400'
          />
        </span>
      )}
    </span>
  );

  if (showLink) {
    return (
      <Tag className={cn(sizeClasses[size])} itemProp='name'>
        <Link href={`/${handle}`} className='inline-block'>
          {content}
        </Link>
      </Tag>
    );
  }

  return (
    <Tag className={cn(sizeClasses[size])} itemProp='name'>
      {content}
    </Tag>
  );
}
