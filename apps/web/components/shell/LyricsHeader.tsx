'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LyricsViewTrack } from './LyricsView.types';

/**
 * LyricsHeader — sticky-top breadcrumb showing artist › track title.
 *
 * Pure presentational. The artist segment renders as a button when
 * `onArtistClick` is provided so consumers can wire navigation (e.g. to
 * the artist's profile or a hover-popover). Otherwise it's plain text.
 *
 * @example
 * ```tsx
 * <LyricsHeader
 *   track={{ artist: 'Bahamas', title: 'Lost in the Light' }}
 *   onArtistClick={() => router.push('/app/artists/bahamas')}
 * />
 * ```
 */
export function LyricsHeader({
  track,
  onArtistClick,
  className,
}: {
  readonly track: LyricsViewTrack;
  readonly onArtistClick?: () => void;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        'shrink-0 sticky top-0 z-10 bg-(--linear-app-content-surface) px-4 pt-3 pb-2 flex items-center gap-1.5 select-none text-[12.5px] font-caption tracking-[-0.012em]',
        className
      )}
    >
      {onArtistClick ? (
        <button
          type='button'
          onClick={onArtistClick}
          className='inline-flex items-center no-underline hover:underline focus-visible:underline underline-offset-2 decoration-dotted text-tertiary-token hover:text-primary-token transition-colors duration-150 ease-out truncate'
        >
          {track.artist}
        </button>
      ) : (
        <span className='text-tertiary-token truncate'>{track.artist}</span>
      )}
      <ChevronRight
        aria-hidden='true'
        className='h-3 w-3 text-quaternary-token/60 shrink-0'
        strokeWidth={2.25}
      />
      <span className='text-primary-token truncate'>{track.title}</span>
    </div>
  );
}
