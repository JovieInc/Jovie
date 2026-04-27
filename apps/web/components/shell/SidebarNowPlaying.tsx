'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { ArtworkPlayOverlay } from './ArtworkPlayOverlay';

export type { NowPlayingTrack } from './now-playing.types';

import type { NowPlayingTrack } from './now-playing.types';

/**
 * SidebarNowPlaying — floating now-playing card pinned to the canvas
 * left-edge, just above the audio bar. Collapsed mode renders just the
 * artwork (10×10) — used when the sidebar itself is collapsed to icons.
 *
 * Pure presentational. Caller controls `isPlaying` + `onPlay`. Pass
 * `playOverlayVisible={true}` when the audio bar is hidden so the artwork
 * surfaces transport.
 *
 * @example
 * ```tsx
 * const { playbackState, toggleTrack } = useTrackAudioPlayer();
 * <SidebarNowPlaying
 *   track={playbackState}
 *   isPlaying={playbackState.isPlaying}
 *   onPlay={() => toggleTrack(playbackState.activeTrack)}
 *   playOverlayVisible={barCollapsed}
 * />
 * ```
 */
export function SidebarNowPlaying({
  track,
  isPlaying,
  onPlay,
  playOverlayVisible,
  collapsed = false,
  className,
}: {
  readonly track: NowPlayingTrack;
  readonly isPlaying: boolean;
  readonly onPlay: () => void;
  /** When true, the artwork's play overlay is fully visible (audio bar is hidden). */
  readonly playOverlayVisible: boolean;
  /** When true, render only the artwork tile (sidebar in icon mode). */
  readonly collapsed?: boolean;
  readonly className?: string;
}) {
  const trackTitle = track.trackTitle ?? '';
  const artistName = track.artistName ?? '';
  const artworkUrl = track.artworkUrl ?? '';

  // Empty state — nothing playing yet. Render nothing rather than a
  // placeholder card so the sidebar bottom doesn't show dead chrome.
  if (!trackTitle && !artworkUrl) return null;

  if (collapsed) {
    return (
      <div
        className={cn(
          'relative h-10 w-10 mx-auto rounded-md overflow-hidden',
          className
        )}
        title={
          trackTitle && artistName ? `${trackTitle} — ${artistName}` : undefined
        }
      >
        {artworkUrl && (
          <Image
            src={artworkUrl}
            alt=''
            fill
            sizes='40px'
            className='object-cover'
            unoptimized
          />
        )}
        <ArtworkPlayOverlay
          isPlaying={isPlaying}
          onPlay={onPlay}
          visible={playOverlayVisible}
        />
        {isPlaying && (
          <span className='absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-2 ring-(--linear-bg-page)' />
        )}
      </div>
    );
  }

  return (
    <div className={cn('px-1 flex items-center gap-2.5', className)}>
      <div className='relative h-9 w-9 rounded overflow-hidden shrink-0'>
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
        <ArtworkPlayOverlay
          isPlaying={isPlaying}
          onPlay={onPlay}
          visible={playOverlayVisible}
        />
      </div>
      <div className='min-w-0 flex-1'>
        <div className='truncate text-[12px] font-caption text-primary-token leading-[1.2]'>
          {trackTitle}
        </div>
        <div className='truncate text-[11px] text-tertiary-token leading-[1.3] mt-0.5'>
          {artistName}
        </div>
      </div>
    </div>
  );
}
