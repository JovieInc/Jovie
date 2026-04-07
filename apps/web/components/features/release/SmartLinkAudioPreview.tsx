'use client';

import { Pause, Play } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { SeekBar } from '@/components/atoms/SeekBar';
import { useTrackAudioPlayer } from '@/components/organisms/release-sidebar/useTrackAudioPlayer';
import type {
  PreviewSource,
  PreviewVerification,
} from '@/lib/discography/types';
import { formatDuration } from '@/lib/utils/formatDuration';

interface SmartLinkAudioPreviewProps {
  readonly contentId: string;
  readonly title: string;
  readonly artistName: string;
  readonly artworkUrl: string | null;
  readonly previewUrl: string | null;
  readonly isrc?: string | null;
  readonly previewVerification?: PreviewVerification;
  readonly previewSource?: PreviewSource;
}

export function SmartLinkAudioPreview({
  contentId,
  title,
  artistName,
  artworkUrl,
  previewUrl,
  isrc,
  previewVerification,
  previewSource,
}: SmartLinkAudioPreviewProps) {
  const { playbackState, toggleTrack, seek, onError } = useTrackAudioPlayer();

  const isThisTrack = playbackState.activeTrackId === contentId;
  const isPlaying = isThisTrack && playbackState.isPlaying;
  const currentTime = isThisTrack ? playbackState.currentTime : 0;
  const duration = isThisTrack ? playbackState.duration : 0;

  useEffect(() => {
    return onError(() => {
      toast.error('Preview unavailable');
    });
  }, [onError]);

  const handleToggle = useCallback(() => {
    if (!previewUrl) return;
    toggleTrack({
      id: contentId,
      title,
      audioUrl: previewUrl,
      isrc,
      releaseTitle: title,
      artistName,
      artworkUrl,
    }).catch(() => {});
  }, [contentId, title, artistName, artworkUrl, previewUrl, isrc, toggleTrack]);

  // Hide entirely when no preview is available
  if (!previewUrl) return null;

  const currentTimeFormatted = formatDuration(Math.round(currentTime) * 1000);
  const durationFormatted =
    duration > 0 ? formatDuration(Math.round(duration) * 1000) : null;
  let fallbackSourceLabel: string | null = null;
  if (previewVerification === 'fallback') {
    const sourceLabels: Record<string, string> = {
      spotify: 'Spotify preview',
      apple_music: 'Apple Music preview',
      deezer: 'Deezer preview',
      musicfetch: 'MusicFetch preview',
      audio_url: 'Stored audio',
    };
    fallbackSourceLabel =
      (previewSource && sourceLabels[previewSource]) ?? 'Fallback preview';
  }

  return (
    <div className='space-y-1.5'>
      <div className='flex items-center gap-2.5'>
        <button
          type='button'
          onClick={handleToggle}
          aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
          aria-pressed={isPlaying}
          className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/90 text-black transition-transform duration-100 hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70'
        >
          {isPlaying ? (
            <Pause className='h-3 w-3' />
          ) : (
            <Play className='h-3 w-3 translate-x-[1px]' />
          )}
        </button>

        <div className='min-w-0 flex-1 space-y-0.5'>
          <SeekBar
            currentTime={currentTime}
            duration={duration}
            onSeek={seek}
            disabled={false}
            className='h-[3px] w-full'
          />
          <div className='flex items-center justify-between text-[10px] tabular-nums text-white/35'>
            <span>{currentTimeFormatted}</span>
            <span>
              {durationFormatted}
              {duration > 0 && duration < 45 ? ' · Preview' : ''}
            </span>
          </div>
        </div>
      </div>
      {fallbackSourceLabel ? (
        <p className='text-[10px] text-white/45'>{fallbackSourceLabel}</p>
      ) : null}
    </div>
  );
}
