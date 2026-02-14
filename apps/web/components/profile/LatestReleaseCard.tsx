'use client';

import { Music } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import type { AvailableDSP } from '@/lib/dsp';
import type { Artist } from '@/types/db';
import { ListenDrawer } from './ListenDrawer';

/** Minimal release shape needed by this client component (avoids server-only schema import). */
type ReleaseCardData = {
  title: string;
  slug: string;
  artworkUrl: string | null;
  releaseDate: Date | string | null;
  releaseType: string;
};

type LatestReleaseCardProps = {
  readonly release: ReleaseCardData;
  readonly artistHandle: string;
  /** Full artist object – required for the mobile listen drawer */
  readonly artist?: Artist;
  /** Merged DSPs – when provided on mobile the Listen button opens a drawer */
  readonly dsps?: AvailableDSP[];
  readonly enableDynamicEngagement?: boolean;
};

/**
 * Compact card displaying the latest release with album art and listen CTA.
 * Designed for reuse with tour dates and merch items (same layout pattern).
 */
export function LatestReleaseCard({
  release,
  artistHandle,
  artist,
  dsps,
  enableDynamicEngagement = false,
}: LatestReleaseCardProps) {
  const isMobile = useBreakpointDown('md');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const releaseYear = release.releaseDate
    ? new Date(release.releaseDate).getFullYear()
    : null;

  const releaseTypeLabel =
    release.releaseType === 'ep'
      ? 'EP'
      : release.releaseType.charAt(0).toUpperCase() +
        release.releaseType.slice(1);

  const showDrawer = isMobile && artist && dsps && dsps.length > 0;

  const listenButtonClass =
    'shrink-0 rounded-full bg-btn-primary px-3.5 py-1.5 text-sm font-medium text-btn-primary-foreground transition-[opacity] duration-150 ease-out hover:opacity-90 active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2';

  return (
    <div className='flex items-center gap-3 rounded-xl border border-subtle bg-surface-0/60 p-2.5 backdrop-blur-sm'>
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

      {/* Listen Button — opens drawer on mobile, navigates on desktop */}
      {showDrawer ? (
        <>
          <button
            type='button'
            onClick={() => setDrawerOpen(true)}
            aria-label={`Listen to ${release.title}`}
            className={listenButtonClass}
          >
            Listen
          </button>
          <ListenDrawer
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            artist={artist}
            dsps={dsps}
            enableDynamicEngagement={enableDynamicEngagement}
          />
        </>
      ) : (
        <Link
          href={`/${artistHandle}/${release.slug}`}
          prefetch={false}
          aria-label={`Listen to ${release.title}`}
          className={listenButtonClass}
        >
          Listen
        </Link>
      )}
    </div>
  );
}
