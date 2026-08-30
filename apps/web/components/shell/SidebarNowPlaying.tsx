'use client';

import Image from 'next/image';
import React from 'react';
import {
  ARTWORK_FIT_CLASSNAME,
  ArtworkFrame,
} from '@/components/atoms/ArtworkFrame';
import { cn } from '@/lib/utils';
import { ArtworkPlayOverlay } from './ArtworkPlayOverlay';

/**
 * Now-playing track shape — matches `useTrackAudioPlayer().playbackState`'s
 * field names so consumers can pass that object directly. All fields
 * nullable since the audio element emits null/empty before metadata loads.
 */
export interface NowPlayingTrack {
  readonly trackTitle: string | null | undefined;
  readonly artistName: string | null | undefined;
  readonly artworkUrl: string | null | undefined;
}

/**
 * SidebarNowPlaying — floating now-playing card pinned to the canvas
 * left-edge, just above the audio bar. Collapsed mode renders just the
 * artwork (10×10) — used when the sidebar itself is collapsed to icons.
 *
 * Pure presentational. Caller controls `isPlaying` + `onPlay`. Pass
 * `playOverlayVisible={true}` when the audio bar is hidden so the artwork
 * surfaces transport.
 *
 * Memoized high-churn renderer over real production NowPlayingTrack + player state.
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
export const SidebarNowPlaying = React.memo(function SidebarNowPlaying({
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
      <ArtworkFrame
        size={40}
        className={cn('mx-auto h-10 w-10', className)}
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
            className={ARTWORK_FIT_CLASSNAME}
            unoptimized
          />
        )}
        <ArtworkPlayOverlay
          isPlaying={isPlaying}
          onPlay={onPlay}
          visible={playOverlayVisible}
        />
        {isPlaying && (
          <span className='absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-2 ring-(--color-bg-page)' />
        )}
      </ArtworkFrame>
    );
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-2 px-0.5', className)}>
      {/* Small docked thumbnail — never full-bleed artwork (JOV-3511). */}
      <ArtworkFrame size={32} className='h-8 w-8 bg-surface-2'>
        {artworkUrl && (
          <Image
            src={artworkUrl}
            alt=''
            fill
            sizes='32px'
            className={ARTWORK_FIT_CLASSNAME}
            unoptimized
          />
        )}
        <ArtworkPlayOverlay
          isPlaying={isPlaying}
          onPlay={onPlay}
          visible={playOverlayVisible}
        />
      </ArtworkFrame>
      <div className='min-w-0 flex-1'>
        <div className='truncate text-xs font-caption text-primary-token leading-[1.2]'>
          {trackTitle}
        </div>
        <div className='truncate text-2xs text-tertiary-token leading-[1.3] mt-0.5'>
          {artistName}
        </div>
      </div>
    </div>
  );
});
