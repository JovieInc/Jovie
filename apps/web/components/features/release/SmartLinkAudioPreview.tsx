'use client';

import { Pause, Play } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SeekBar } from '@/components/atoms/SeekBar';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { formatDuration } from '@/lib/utils/formatDuration';

interface SmartLinkAudioPreviewProps {
  readonly contentId: string;
  readonly title: string;
  readonly artistName: string;
  readonly artworkUrl: string | null;
  readonly previewUrl: string | null;
}

export function SmartLinkAudioPreview({
  contentId,
  title,
  artistName,
  artworkUrl,
  previewUrl,
}: SmartLinkAudioPreviewProps) {
  const { playbackState, toggleTrack, seek, onError } = useTrackAudioPlayer();
  const [imgError, setImgError] = useState(false);

  const isThisTrack = playbackState.activeTrackId === contentId;
  const isPlaying = isThisTrack && playbackState.isPlaying;
  const currentTime = isThisTrack ? playbackState.currentTime : 0;
  const duration = isThisTrack ? playbackState.duration : 0;
  const disabled = !previewUrl;

  useEffect(() => {
    return onError(() => {
      toast.error('Preview unavailable');
    });
  }, [onError]);

  useEffect(() => {
    setImgError(false);
  }, [artworkUrl]);

  const handleToggle = useCallback(() => {
    if (!previewUrl) return;
    toggleTrack({
      id: contentId,
      title,
      audioUrl: previewUrl,
      releaseTitle: title,
      artistName,
      artworkUrl,
    }).catch(() => {});
  }, [contentId, title, artistName, artworkUrl, previewUrl, toggleTrack]);

  const currentTimeFormatted = formatDuration(Math.round(currentTime) * 1000);
  const durationFormatted =
    duration > 0 ? formatDuration(Math.round(duration) * 1000) : null;

  return (
    <div
      className={
        disabled
          ? 'space-y-2.5 rounded-xl bg-surface-1/30 p-3 ring-1 ring-inset ring-white/[0.06] backdrop-blur-sm'
          : 'space-y-2.5 rounded-xl bg-surface-1/55 p-3 ring-1 ring-inset ring-white/10 backdrop-blur-sm'
      }
    >
      <div className='flex items-center gap-3'>
        {/* Artwork thumbnail */}
        {artworkUrl && !imgError ? (
          <Image
            src={artworkUrl}
            alt=''
            width={40}
            height={40}
            className={`h-10 w-10 shrink-0 rounded-lg object-cover${disabled ? ' opacity-40' : ''}`}
            unoptimized
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]${disabled ? ' opacity-40' : ''}`}
          >
            <Play className='h-4 w-4 text-white/30' />
          </div>
        )}

        {/* Title + artist */}
        <div className={`min-w-0 flex-1${disabled ? ' opacity-40' : ''}`}>
          <p className='truncate text-[13px] font-medium leading-tight text-white/90'>
            {title}
          </p>
          <p className='truncate text-[11px] leading-tight text-white/50'>
            {artistName}
          </p>
        </div>

        {/* Play/Pause button */}
        <button
          type='button'
          onClick={handleToggle}
          disabled={disabled}
          aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
          aria-pressed={isPlaying}
          className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 text-black transition-[transform,scale] duration-100 hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:bg-white/20 disabled:text-white/30 disabled:hover:scale-100'
        >
          {isPlaying ? (
            <Pause className='h-4 w-4' />
          ) : (
            <Play className='h-4 w-4 translate-x-[1px]' />
          )}
        </button>
      </div>

      {/* Seek bar + time */}
      <div className='space-y-1'>
        <SeekBar
          currentTime={currentTime}
          duration={duration}
          onSeek={seek}
          disabled={disabled}
          className='h-[3px] w-full'
        />
        <div className='flex items-center justify-between text-[10px] tabular-nums text-white/35'>
          {disabled ? (
            <span>Preview not available</span>
          ) : (
            <>
              <span>{currentTimeFormatted}</span>
              <span>
                {durationFormatted}
                {duration > 0 && duration < 45 ? ' · Preview' : ''}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
