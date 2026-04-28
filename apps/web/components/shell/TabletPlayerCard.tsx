'use client';

import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import Image from 'next/image';
import { formatTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';
import type { NowPlayingTrack } from './SidebarNowPlaying';

/**
 * TabletPlayerCard — `md` ↔ `lg` now-playing card. Same liquid-glass
 * language as `MobilePlayerCard`, with prev/next flanking the play button
 * and a real scrub bar across the top edge so you can seek without
 * expanding into the full bar.
 *
 * Pure presentational. Caller owns `currentTime` / `duration` so the
 * timestamps stay in lockstep with the audio element.
 *
 * @example
 * ```tsx
 * const { playbackState, toggleTrack } = useTrackAudioPlayer();
 * <TabletPlayerCard
 *   track={playbackState}
 *   isPlaying={playbackState.isPlaying}
 *   currentTime={playbackState.currentTime}
 *   duration={playbackState.duration}
 *   onPlay={() => toggleTrack(playbackState.activeTrack)}
 * />
 * ```
 */
export function TabletPlayerCard({
  track,
  isPlaying,
  currentTime,
  duration,
  onPlay,
  onPrevious,
  onNext,
  className,
}: {
  readonly track: NowPlayingTrack;
  readonly isPlaying: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly onPlay: () => void;
  readonly onPrevious?: () => void;
  readonly onNext?: () => void;
  readonly className?: string;
}) {
  const trackTitle = track.trackTitle ?? '';
  const artistName = track.artistName ?? '';
  const artworkUrl = track.artworkUrl ?? '';

  if (!trackTitle && !artworkUrl) return null;

  const safeTime = Number.isFinite(currentTime) ? currentTime : 0;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const pct = safeDuration > 0 ? (safeTime / safeDuration) * 100 : 0;

  return (
    <div
      className={cn(
        'hidden md:block lg:hidden fixed inset-x-4 z-40 bottom-4',
        className
      )}
    >
      <div className='rounded-2xl backdrop-blur-2xl bg-(--linear-app-content-surface)/70 border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.18)] relative overflow-hidden'>
        <span
          aria-hidden='true'
          className='absolute top-0 left-0 right-0 h-px bg-tertiary-token/30'
        />
        <span
          aria-hidden='true'
          className='absolute top-0 left-0 h-px bg-primary-token'
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />

        <div className='grid grid-cols-[minmax(160px,1fr)_auto_minmax(200px,2fr)] items-center gap-4 px-3 py-2.5'>
          <div className='flex items-center gap-3 min-w-0'>
            <div className='relative h-10 w-10 rounded-lg overflow-hidden shrink-0 bg-surface-2'>
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
            </div>
            <div className='min-w-0'>
              <div className='truncate text-[13px] font-caption text-primary-token leading-tight'>
                {trackTitle}
              </div>
              <div className='truncate text-[11px] text-tertiary-token leading-tight mt-0.5'>
                {artistName}
              </div>
            </div>
          </div>

          <div className='flex items-center gap-1.5 justify-self-center'>
            <button
              type='button'
              onClick={onPrevious}
              className='h-8 w-8 rounded grid place-items-center text-quaternary-token hover:text-primary-token transition-colors duration-150 ease-out'
              aria-label='Previous'
            >
              <SkipBack
                className='h-4 w-4'
                strokeWidth={2.5}
                fill='currentColor'
              />
            </button>
            <button
              type='button'
              onClick={onPlay}
              className='h-9 w-9 rounded-full grid place-items-center bg-primary text-on-primary transition-transform duration-150 ease-out active:scale-95'
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause
                  className='h-4 w-4'
                  strokeWidth={2.5}
                  fill='currentColor'
                />
              ) : (
                <Play
                  className='h-4 w-4 translate-x-px'
                  strokeWidth={2.5}
                  fill='currentColor'
                />
              )}
            </button>
            <button
              type='button'
              onClick={onNext}
              className='h-8 w-8 rounded grid place-items-center text-quaternary-token hover:text-primary-token transition-colors duration-150 ease-out'
              aria-label='Next'
            >
              <SkipForward
                className='h-4 w-4'
                strokeWidth={2.5}
                fill='currentColor'
              />
            </button>
          </div>

          <div className='flex items-center gap-2 min-w-0'>
            <span className='text-[10px] tabular-nums text-quaternary-token w-8 text-right shrink-0'>
              {formatTime(safeTime)}
            </span>
            <div className='relative flex-1 h-[3px] rounded-full bg-tertiary-token/30 overflow-hidden'>
              <div
                className='absolute inset-y-0 left-0 bg-primary-token rounded-full'
                style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
              />
            </div>
            <span className='text-[10px] tabular-nums text-quaternary-token w-8 shrink-0'>
              {formatTime(safeDuration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
