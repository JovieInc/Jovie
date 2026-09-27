'use client';

import { Button } from '@jovie/ui';
import { AudioLines, Pause, Play, X } from 'lucide-react';
import Image from 'next/image';
import React from 'react';
import {
  ARTWORK_FIT_CLASSNAME,
  ArtworkFrame,
} from '@/components/atoms/ArtworkFrame';
import { cn } from '@/lib/utils';
import { IconBtn } from './IconBtn';
import type { NowPlayingTrack } from './SidebarNowPlaying';
import { Tooltip } from './Tooltip';

/**
 * SidebarBottomNowPlaying — compact now-playing row mounted at the
 * bottom of the sidebar. Artwork (36×36) + title/artist + small play
 * button. Returns null when nothing's playing.
 *
 * Memoized high-churn now-playing row renderer over real production
 * NowPlayingTrack + player state (play/pause/empty transitions).
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
export const SidebarBottomNowPlaying = React.memo(
  function SidebarBottomNowPlaying({
    track,
    isPlaying,
    onPlay,
    onDismiss,
    collapsed = false,
    className,
  }: {
    readonly track: NowPlayingTrack;
    readonly isPlaying: boolean;
    readonly onPlay: () => void;
    readonly onDismiss?: () => void;
    readonly collapsed?: boolean;
    readonly className?: string;
  }) {
    const trackTitle = track.trackTitle ?? '';
    const artistName = track.artistName ?? '';
    const artworkUrl = track.artworkUrl ?? '';

    if (!trackTitle && !artworkUrl) return null;

    if (collapsed) {
      return (
        <Tooltip label={trackTitle || 'Now playing'} side='right'>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            onClick={onPlay}
            aria-label={
              isPlaying ? `Pause ${trackTitle}` : `Play ${trackTitle}`
            }
            className='mx-auto'
          >
            <ArtworkFrame size={28} className='size-7 bg-surface-2'>
              {artworkUrl ? (
                <Image
                  src={artworkUrl}
                  alt=''
                  fill
                  sizes='28px'
                  className={ARTWORK_FIT_CLASSNAME}
                  unoptimized
                />
              ) : null}
            </ArtworkFrame>
            {isPlaying ? (
              <span className='absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-sidebar-accent text-sidebar-item-foreground ring-1 ring-sidebar-border'>
                <AudioLines aria-hidden='true' className='size-2.5' />
              </span>
            ) : null}
          </Button>
        </Tooltip>
      );
    }

    return (
      <div
        className={cn(
          'group/now-playing flex h-12 items-center gap-2 rounded-md px-1.5 transition-colors duration-subtle ease-subtle hover:bg-surface-1/40',
          className
        )}
      >
        <div className='relative size-9 shrink-0'>
          <ArtworkFrame size={36} className='size-9 bg-surface-2'>
            {artworkUrl ? (
              <Image
                src={artworkUrl}
                alt=''
                fill
                sizes='36px'
                className={ARTWORK_FIT_CLASSNAME}
                unoptimized
              />
            ) : null}
          </ArtworkFrame>
          <div className='absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-subtle ease-subtle focus-within:opacity-100 group-hover/now-playing:opacity-100'>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              onClick={onPlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <span className='pointer-events-none absolute inset-0 rounded-full bg-black/55' />
              {isPlaying ? (
                <Pause
                  aria-hidden='true'
                  className='relative size-3 text-tooltip-foreground'
                  strokeWidth={2.5}
                  fill='currentColor'
                />
              ) : (
                <Play
                  aria-hidden='true'
                  className='relative size-3 translate-x-px text-tooltip-foreground'
                  strokeWidth={2.5}
                  fill='currentColor'
                />
              )}
            </Button>
          </div>
        </div>
        <div className='min-w-0 flex-1'>
          <div
            className='truncate text-xs font-caption text-primary-token leading-tight'
            style={{ letterSpacing: '-0.005em' }}
          >
            {trackTitle}
          </div>
          <div className='truncate text-3xs text-tertiary-token leading-tight mt-0.5'>
            {artistName}
          </div>
        </div>
        {onDismiss ? (
          <IconBtn
            label='Dismiss Player'
            onClick={onDismiss}
            tooltipSide='top'
            tone='ghost'
            className='shrink-0'
          >
            <X aria-hidden='true' className='size-3.5' strokeWidth={2.25} />
          </IconBtn>
        ) : null}
      </div>
    );
  }
);
