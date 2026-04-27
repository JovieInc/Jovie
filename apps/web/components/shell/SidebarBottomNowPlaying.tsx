'use client';

import { Pause, Play } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { NowPlayingTrack } from './SidebarNowPlaying';

/**
 * SidebarBottomNowPlaying — compact now-playing row mounted at the
 * bottom of the sidebar. Artwork (36×36) + title/artist + small play
 * button. Returns null when nothing's playing.
 *
 * @example
 * ```tsx
 * const { playbackState, toggleTrack } = useTrackAudioPlayer();
 * playbackState.activeTrackId !== null ? (
 *   <SidebarBottomNowPlaying
 *     track={playbackState}
 *     isPlaying={playbackState.isPlaying}
 *     onPlay={() => toggleTrack(playbackState.activeTrack)}
 *   />
 * ) : null
 * ```
 */
export function SidebarBottomNowPlaying({
  track,
  isPlaying,
  onPlay,
  className,
}: {
  readonly track: NowPlayingTrack;
  readonly isPlaying: boolean;
  readonly onPlay: () => void;
  readonly className?: string;
}) {
  const trackTitle = track.trackTitle ?? '';
  const artistName = track.artistName ?? '';
  const artworkUrl = track.artworkUrl ?? '';

  if (!trackTitle && !artworkUrl) return null;

  return (
    <div
      className={cn(
        'flex items-center gap-2 h-12 px-1.5 rounded-md hover:bg-surface-1/40 transition-colors duration-150 ease-out',
        className
      )}
    >
      <div className='shrink-0 h-9 w-9 rounded overflow-hidden bg-surface-2 relative'>
        {artworkUrl && (
          <Image
            src={artworkUrl}
            alt=''
            fill
            sizes='36px'
            className='object-cover'
            unoptimized
          />
        )}
      </div>
      <div className='min-w-0 flex-1'>
        <div
          className='truncate text-[12px] font-caption text-primary-token leading-tight'
          style={{ letterSpacing: '-0.005em' }}
        >
          {trackTitle}
        </div>
        <div className='truncate text-[10.5px] text-tertiary-token leading-tight mt-0.5'>
          {artistName}
        </div>
      </div>
      <button
        type='button'
        onClick={onPlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className='shrink-0 h-7 w-7 rounded-full grid place-items-center text-primary-token hover:bg-surface-1/70 transition-colors duration-150 ease-out'
      >
        {isPlaying ? (
          <Pause className='h-3 w-3' strokeWidth={2.5} fill='currentColor' />
        ) : (
          <Play
            className='h-3 w-3 translate-x-px'
            strokeWidth={2.5}
            fill='currentColor'
          />
        )}
      </button>
    </div>
  );
}
