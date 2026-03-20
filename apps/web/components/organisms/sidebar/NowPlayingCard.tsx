'use client';

import { Pause, Play } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TruncatedText } from '@/components/atoms/TruncatedText';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import { formatDuration } from '@/lib/utils/formatDuration';
import { useSidebar } from './context';

export function NowPlayingCard() {
  const { playbackState, toggleTrack, onError } = useTrackAudioPlayer();
  const { state: sidebarState } = useSidebar();
  const isCollapsed = sidebarState === 'closed';

  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    return onError(() => {
      toast.error('Preview unavailable');
    });
  }, [onError]);

  // Reset image error state when track changes
  useEffect(() => {
    setImgError(false);
  }, [playbackState.artworkUrl]);

  const handleToggle = useCallback(() => {
    if (!playbackState.activeTrackId || !playbackState.trackTitle) return;
    toggleTrack({
      id: playbackState.activeTrackId,
      title: playbackState.trackTitle,
      audioUrl: '', // Not needed for toggle — same track ID triggers pause/resume
    }).catch(() => {});
  }, [playbackState.activeTrackId, playbackState.trackTitle, toggleTrack]);

  if (!playbackState.activeTrackId) return null;

  const progressPercent =
    playbackState.duration > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (playbackState.currentTime / playbackState.duration) * 100
          )
        )
      : 0;

  const currentTimeFormatted = formatDuration(
    Math.round(playbackState.currentTime) * 1000
  );
  const durationFormatted =
    playbackState.duration > 0
      ? formatDuration(Math.round(playbackState.duration) * 1000)
      : null;

  if (isCollapsed) {
    return (
      <div className='flex items-center justify-center px-0.5 py-1'>
        <button
          type='button'
          onClick={handleToggle}
          className='flex h-8 w-8 items-center justify-center rounded-[8px] text-secondary-token transition-[background-color,color] duration-150 hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
          aria-label={
            playbackState.isPlaying ? 'Pause playback' : 'Resume playback'
          }
        >
          {playbackState.isPlaying ? (
            <Pause className='h-3.5 w-3.5' />
          ) : (
            <Play className='h-3.5 w-3.5' />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className='animate-in fade-in slide-in-from-bottom-2 duration-200 space-y-1.5 rounded-[8px] border border-subtle bg-surface-0/50 p-2'>
      <div className='flex items-center gap-2.5'>
        {playbackState.artworkUrl && !imgError ? (
          <Image
            src={playbackState.artworkUrl}
            alt=''
            width={36}
            height={36}
            className='h-9 w-9 shrink-0 rounded-[6px] object-cover'
            unoptimized
            onError={() => setImgError(true)}
          />
        ) : (
          <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-surface-1'>
            <Play className='h-3.5 w-3.5 text-tertiary-token' />
          </div>
        )}

        <div className='min-w-0 flex-1'>
          <TruncatedText
            lines={1}
            className='text-[12.5px] font-[510] leading-[1.2] text-primary-token'
          >
            {playbackState.trackTitle ?? ''}
          </TruncatedText>
          {(playbackState.releaseTitle || playbackState.artistName) && (
            <TruncatedText
              lines={1}
              className='text-[11px] leading-[1.3] text-tertiary-token'
            >
              {[playbackState.artistName, playbackState.releaseTitle]
                .filter(Boolean)
                .join(' · ')}
            </TruncatedText>
          )}
        </div>

        <button
          type='button'
          onClick={handleToggle}
          className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface-0 text-secondary-token transition-[background-color,color,border-color] duration-150 hover:border-default hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
          aria-label={
            playbackState.isPlaying ? 'Pause playback' : 'Resume playback'
          }
        >
          {playbackState.isPlaying ? (
            <Pause className='h-3 w-3' />
          ) : (
            <Play className='h-3 w-3' />
          )}
        </button>
      </div>

      <div className='space-y-0.5'>
        <div className='h-[3px] w-full overflow-hidden rounded-full bg-surface-1'>
          <div
            className='h-full rounded-full bg-(--linear-accent) transition-[width] duration-200'
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className='flex items-center justify-between text-[10px] tabular-nums text-quaternary-token'>
          <span>{currentTimeFormatted}</span>
          {durationFormatted && <span>{durationFormatted}</span>}
        </div>
      </div>
    </div>
  );
}
