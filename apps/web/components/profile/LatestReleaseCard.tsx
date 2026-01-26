import { Music } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { DiscogRelease } from '@/lib/db/schema';

type LatestReleaseCardProps = {
  release: DiscogRelease;
  artistHandle: string;
};

/**
 * Compact card displaying the latest release with album art and listen CTA.
 * Designed for reuse with tour dates and merch items (same layout pattern).
 */
export function LatestReleaseCard({
  release,
  artistHandle,
}: LatestReleaseCardProps) {
  const releaseYear = release.releaseDate
    ? new Date(release.releaseDate).getFullYear()
    : null;

  const releaseTypeLabel =
    release.releaseType === 'ep'
      ? 'EP'
      : release.releaseType.charAt(0).toUpperCase() +
        release.releaseType.slice(1);

  return (
    <div className='flex items-center gap-3 rounded-lg border border-subtle bg-surface-0/60 p-2 backdrop-blur-sm'>
      {/* Album Art */}
      <div className='relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-surface-1'>
        {release.artworkUrl ? (
          <Image
            src={release.artworkUrl}
            alt={`${release.title} artwork`}
            fill
            sizes='56px'
            className='object-cover'
          />
        ) : (
          <div className='flex h-full w-full items-center justify-center'>
            <Music
              className='h-6 w-6 text-tertiary-token'
              strokeWidth={1.5}
              aria-label='Music note'
            />
          </div>
        )}
      </div>

      {/* Release Info */}
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium text-primary-token'>
          {release.title}
        </p>
        <p className='text-xs text-secondary-token'>
          {releaseTypeLabel}
          {releaseYear && ` · ${releaseYear}`}
        </p>
      </div>

      {/* Listen Button */}
      <Link
        href={`/${artistHandle}/listen`}
        prefetch={false}
        className='shrink-0 rounded-full bg-btn-primary px-4 py-2 text-sm font-medium text-btn-primary-foreground transition-[transform,opacity] duration-150 ease-out hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2'
      >
        Listen
      </Link>
    </div>
  );
}
