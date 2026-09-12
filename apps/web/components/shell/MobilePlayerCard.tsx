'use client';

import Image from 'next/image';
import React from 'react';
import {
  ARTWORK_FIT_CLASSNAME,
  ArtworkFrame,
} from '@/components/atoms/ArtworkFrame';
import { cn } from '@/lib/utils';
import { AudioPlayButton } from './AudioPlayButton';
import type { NowPlayingTrack } from './SidebarNowPlaying';

/**
 * MobilePlayerCard — frosted "liquid glass" now-playing card pinned to the
 * bottom of the viewport on phones. `md:hidden` — at tablet+ either the
 * `TabletPlayerCard` or the full `AudioBar` takes over.
 *
 * Hairline progress bar sits at the top edge of the card (1px). Clicking
 * the card surface does nothing; the play button toggles transport.
 *
 * Pure presentational. Caller controls `isPlaying`, `pct`, `onPlay`, and
 * supplies a `NowPlayingTrack` so the card can pull from
 * `useTrackAudioPlayer().playbackState` directly.
 *
 * Memoized high-churn mobile now-playing renderer over real prod audio state.
 *
 * @example
 * ```tsx
 * const { playbackState, toggleTrack } = useTrackAudioPlayer();
 * <MobilePlayerCard
 *   track={playbackState}
 *   isPlaying={playbackState.isPlaying}
 *   pct={(playbackState.currentTime / playbackState.duration) * 100}
 *   onPlay={() => toggleTrack(playbackState.activeTrack)}
 * />
 * ```
 */
export const MobilePlayerCard = React.memo(function MobilePlayerCard({
  track,
  isPlaying,
  pct,
  onPlay,
  className,
}: {
  readonly track: NowPlayingTrack;
  readonly isPlaying: boolean;
  /** 0-100 — caller computes from `currentTime / duration`. */
  readonly pct: number;
  readonly onPlay: () => void;
  readonly className?: string;
}) {
  const trackTitle = track.trackTitle ?? '';
  const artistName = track.artistName ?? '';
  const artworkUrl = track.artworkUrl ?? '';

  if (!trackTitle && !artworkUrl) return null;

  const safePct = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;

  return (
    <div className={cn('md:hidden fixed inset-x-3 z-40 bottom-3', className)}>
      <div className='rounded-2xl px-2.5 py-2 flex items-center gap-2.5 backdrop-blur-2xl bg-(--app-shell-content-surface)/70 border border-(--app-shell-frame-seam) shadow-[0_10px_40px_rgba(0,0,0,0.18)] relative overflow-hidden'>
        <span
          aria-hidden='true'
          className='absolute top-0 left-0 right-0 h-px bg-tertiary-token/30'
        />
        <span
          aria-hidden='true'
          className='absolute top-0 left-0 h-px bg-primary-token'
          style={{ width: `${safePct}%` }}
        />

        <ArtworkFrame size={40} className='h-10 w-10 shrink-0 bg-surface-2'>
          {artworkUrl && (
            <Image
              src={artworkUrl}
              alt=''
              fill
              sizes='40px'
              className={ARTWORK_FIT_CLASSNAME}
              unoptimized
            />
          )}
        </ArtworkFrame>

        <div className='min-w-0 flex-1'>
          <div className='truncate text-app font-caption text-primary-token leading-tight'>
            {trackTitle}
          </div>
          <div className='truncate text-2xs text-tertiary-token leading-tight mt-0.5'>
            {artistName}
          </div>
        </div>

        <AudioPlayButton
          isPlaying={isPlaying}
          onClick={onPlay}
          size='compact'
          className='shrink-0'
        />
      </div>
    </div>
  );
});
