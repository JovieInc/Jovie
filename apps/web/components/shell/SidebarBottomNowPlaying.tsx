'use client';

import { Button, IconButton, PlainButton } from '@jovie/ui';
import { AudioLines, Pause, X } from 'lucide-react';
import Image from 'next/image';
import React from 'react';
import {
  ARTWORK_FIT_CLASSNAME,
  ArtworkFrame,
} from '@/components/atoms/ArtworkFrame';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { PlayIcon } from '@/components/atoms/PlayIcon';
import { cn } from '@/lib/utils';
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
    onExpand,
    collapsed = false,
    footer = false,
    className,
  }: {
    readonly track: NowPlayingTrack;
    readonly isPlaying: boolean;
    readonly onPlay: () => void;
    readonly onDismiss?: () => void;
    /** Reopen the full docked player (JOV-6680). Tapping the track info expands. */
    readonly onExpand?: () => void;
    readonly collapsed?: boolean;
    readonly footer?: boolean;
    readonly className?: string;
  }) {
    const trackTitle = track.trackTitle ?? '';
    const artistName = track.artistName ?? '';
    const artworkUrl = track.artworkUrl ?? '';

    if (!trackTitle && !artworkUrl) return null;

    if (footer) {
      const details = (
        <>
          <span className='sidebar-footer-track-title truncate'>
            {trackTitle}
          </span>
          {artistName ? (
            <span className='sidebar-footer-track-artist truncate'>
              {artistName}
            </span>
          ) : null}
        </>
      );
      return (
        <div className='sidebar-footer-player'>
          <PlainButton
            type='button'
            className='sidebar-footer-play'
            aria-label={`${isPlaying ? 'Pause' : 'Play'} ${trackTitle}`}
            onClick={onPlay}
          >
            <BrandLogo
              size='control'
              className='sidebar-footer-play-mark'
              aria-hidden
            />
            <ArtworkFrame size={28} className='sidebar-footer-artwork'>
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
              <span className='sidebar-footer-play-overlay' aria-hidden='true'>
                {isPlaying ? <Pause size={16} /> : <PlayIcon size={16} />}
              </span>
            </ArtworkFrame>
          </PlainButton>
          {onExpand && !collapsed ? (
            <PlainButton
              type='button'
              className='sidebar-footer-track'
              data-audio-expand-player='true'
              onClick={onExpand}
            >
              {details}
              <span className='sr-only'>Show Player</span>
            </PlainButton>
          ) : null}
          {!onExpand && !collapsed ? (
            <div className='sidebar-footer-track'>{details}</div>
          ) : null}
          {onDismiss && !collapsed ? (
            <PlainButton
              type='button'
              aria-label='Dismiss Player'
              onClick={onDismiss}
              className='sidebar-footer-dismiss'
            >
              <X aria-hidden='true' size={16} />
            </PlainButton>
          ) : null}
        </div>
      );
    }

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
          <div className='absolute left-1/2 top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-subtle ease-subtle focus-within:opacity-100 group-hover/now-playing:opacity-100 [@media(hover:none)]:opacity-100'>
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              onClick={onPlay}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <span className='pointer-events-none absolute inset-0 rounded-full bg-ink-on-media/55' />
              {isPlaying ? (
                <Pause
                  aria-hidden='true'
                  className='relative size-3 text-tooltip-foreground'
                  strokeWidth={2.5}
                  fill='currentColor'
                />
              ) : (
                <PlayIcon
                  size={12}
                  aria-hidden='true'
                  className='relative text-tooltip-foreground'
                  strokeWidth={2.5}
                  fill='currentColor'
                />
              )}
            </Button>
          </div>
        </div>
        {onExpand ? (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={onExpand}
            data-audio-expand-player='true'
            className='min-w-0 flex-1 justify-start'
          >
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
            {/* An aria-label would shadow the visible title/artist and trip axe
                label-content-name-mismatch; append the purpose instead so the
                accessible name contains the visible text. */}
            <span className='sr-only'>Show Player</span>
          </Button>
        ) : (
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
        )}
        {onDismiss ? (
          <Tooltip label='Dismiss Player' side='top'>
            <IconButton
              size='sm'
              ariaLabel='Dismiss Player'
              onClick={onDismiss}
              className='shrink-0'
            >
              <X aria-hidden='true' className='size-3.5' strokeWidth={2.25} />
            </IconButton>
          </Tooltip>
        ) : null}
      </div>
    );
  }
);
