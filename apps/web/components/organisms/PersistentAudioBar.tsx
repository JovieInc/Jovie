'use client';

import { Pause, Play, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SeekBar } from '@/components/atoms/SeekBar';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { formatDuration } from '@/lib/utils/formatDuration';

export function PersistentAudioBar() {
  const { playbackState, toggleTrack, seek, stop, onError } =
    useTrackAudioPlayer();
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    return onError(() => {
      toast.error('Preview unavailable', { id: 'audio-preview-error' });
    });
  }, [onError]);

  useEffect(() => {
    setImgError(false);
  }, [playbackState.artworkUrl]);

  const handleToggle = useCallback(() => {
    if (!playbackState.activeTrackId || !playbackState.trackTitle) return;
    toggleTrack({
      id: playbackState.activeTrackId,
      title: playbackState.trackTitle,
    }).catch(() => {});
  }, [playbackState.activeTrackId, playbackState.trackTitle, toggleTrack]);

  if (!playbackState.activeTrackId) return null;

  const isLoading = playbackState.playbackStatus === 'loading';

  const currentTimeFormatted = formatDuration(
    Math.round(playbackState.currentTime) * 1000
  );
  const durationFormatted =
    playbackState.duration > 0
      ? formatDuration(Math.round(playbackState.duration) * 1000)
      : null;
  const isPreview = playbackState.duration > 0 && playbackState.duration < 45;

  let playButtonLabel = 'Resume playback';
  let playButtonIcon = <Play className='h-3 w-3' />;
  if (isLoading) {
    playButtonLabel = 'Loading track';
    playButtonIcon = (
      <div className='h-3 w-3 animate-pulse rounded-full bg-current' />
    );
  } else if (playbackState.isPlaying) {
    playButtonLabel = 'Pause playback';
    playButtonIcon = <Pause className='h-3 w-3' />;
  }

  return (
    <section
      aria-label='Audio player'
      className='animate-in fade-in slide-in-from-bottom-2 duration-200 shrink-0 border-t border-subtle bg-(--linear-app-content-surface) backdrop-blur-xl px-3 py-2 max-lg:mb-[calc(3.5rem+env(safe-area-inset-bottom))]'
    >
      <div className='flex items-center gap-3'>
        {/* Artwork */}
        {playbackState.artworkUrl && !imgError ? (
          <Image
            src={playbackState.artworkUrl}
            alt=''
            width={36}
            height={36}
            className='h-9 w-9 shrink-0 rounded-lg object-cover'
            unoptimized
            onError={() => setImgError(true)}
          />
        ) : (
          <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-1'>
            <Play className='h-3.5 w-3.5 text-tertiary-token' />
          </div>
        )}

        {/* Track info */}
        <div className='min-w-0 shrink-0 w-[120px] lg:w-[180px]'>
          <TruncatedText
            lines={1}
            className='text-[12.5px] font-caption leading-[1.2] text-primary-token'
          >
            {playbackState.trackTitle ?? ''}
          </TruncatedText>
          {(playbackState.releaseTitle || playbackState.artistName) && (
            <TruncatedText
              lines={1}
              className='text-2xs leading-[1.3] text-tertiary-token'
            >
              {[playbackState.artistName, playbackState.releaseTitle]
                .filter(Boolean)
                .join(' · ')}
            </TruncatedText>
          )}
        </div>

        {/* Seek area */}
        <div className='flex flex-1 items-center gap-2 min-w-0'>
          <span className='text-[10px] tabular-nums text-quaternary-token shrink-0 w-8 text-right'>
            {currentTimeFormatted}
          </span>
          <SeekBar
            currentTime={playbackState.currentTime}
            duration={playbackState.duration}
            onSeek={seek}
            disabled={isLoading}
            className='h-[3px] flex-1 min-w-[60px] bg-surface-1'
          />
          <span className='text-[10px] tabular-nums text-quaternary-token shrink-0 w-8'>
            {durationFormatted}
          </span>
          {isPreview ? (
            <span className='text-[9px] text-tertiary-token shrink-0'>
              Preview
            </span>
          ) : null}
        </div>

        {/* Play/pause button — 28px visible, 44px touch target via before pseudo-element */}
        <button
          type='button'
          onClick={handleToggle}
          disabled={isLoading}
          className='relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token transition-[background-color,color,border-color] duration-150 hover:border-default hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus) disabled:opacity-50 before:absolute before:-inset-2 before:content-[""]'
          aria-label={playButtonLabel}
        >
          {playButtonIcon}
        </button>

        {/* Dismiss button — 24px visible, 44px touch target via before pseudo-element */}
        <button
          type='button'
          onClick={stop}
          className='relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-quaternary-token transition-colors duration-150 hover:text-secondary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus) before:absolute before:-inset-2.5 before:content-[""]'
          aria-label='Dismiss player'
        >
          <X className='h-3.5 w-3.5' />
        </button>
      </div>
    </section>
  );
}
