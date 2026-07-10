'use client';

import { Loader2, Pause, Play } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { SeekBar } from '@/components/atoms/SeekBar';
import { toast } from '@/components/feedback';
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

/**
 * Fan-facing smart-link audio preview. Thin UI over the single global
 * playback engine — never instantiates its own audio element (JOV-3683).
 * Layout is height-stable across idle/loading/playing to avoid CLS (JOV-3681).
 */
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
  const isLoading = isThisTrack && playbackState.playbackStatus === 'loading';
  const isPlaying = isThisTrack && playbackState.isPlaying;
  const currentTime = isThisTrack ? playbackState.currentTime : 0;
  const duration = isThisTrack ? playbackState.duration : 0;
  const canScrub = isThisTrack && duration > 0 && !isLoading;

  useEffect(() => {
    return onError(reason => {
      if (reason === 'missing_source') return;
      toast.error('Preview unavailable');
    });
  }, [onError]);

  const handleToggle = useCallback(() => {
    if (!previewUrl || isLoading) return;
    toggleTrack({
      id: contentId,
      title,
      audioUrl: previewUrl,
      isrc,
      releaseTitle: title,
      artistName,
      artworkUrl,
    }).catch(() => {});
  }, [
    contentId,
    title,
    artistName,
    artworkUrl,
    previewUrl,
    isrc,
    isLoading,
    toggleTrack,
  ]);

  // Hide entirely when no preview is available
  if (!previewUrl) return null;

  const currentTimeFormatted = formatDuration(Math.round(currentTime) * 1000);
  const durationFormatted =
    duration > 0 ? formatDuration(Math.round(duration) * 1000) : '–:––';
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

  let statusLabel = isPlaying ? 'Pause preview' : 'Play preview';
  if (isLoading) statusLabel = 'Loading preview';

  return (
    <div className='space-y-1.5' data-testid='smart-link-audio-preview'>
      <div className='flex min-h-10 items-center gap-2.5'>
        <button
          type='button'
          onClick={handleToggle}
          aria-label={statusLabel}
          aria-pressed={isPlaying}
          aria-busy={isLoading || undefined}
          disabled={isLoading}
          className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 text-black transition-colors duration-fast hover:bg-white active:scale-[var(--scale-press)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70 disabled:opacity-70 motion-reduce:active:scale-100'
        >
          {isLoading ? (
            <Loader2
              className='h-3.5 w-3.5 animate-spin motion-reduce:animate-none'
              aria-hidden='true'
              strokeWidth={2.25}
            />
          ) : isPlaying ? (
            <Pause className='h-3.5 w-3.5' aria-hidden='true' />
          ) : (
            <Play className='h-3.5 w-3.5 translate-x-px' aria-hidden='true' />
          )}
        </button>

        <div className='min-w-0 flex-1 space-y-1'>
          {/* Fixed scrub row height so play/pause/load never shifts layout */}
          <div className='flex h-4 items-center'>
            <SeekBar
              currentTime={currentTime}
              duration={duration}
              onSeek={seek}
              disabled={!canScrub}
              className='h-1.5 w-full'
            />
          </div>
          <div className='flex h-3.5 items-center justify-between text-3xs tabular-nums text-white/35'>
            <span className='min-w-8'>{currentTimeFormatted}</span>
            <span className='min-w-12 text-right'>
              {durationFormatted}
              {duration > 0 && duration < 45 ? ' · Preview' : ''}
            </span>
          </div>
        </div>
      </div>
      {/* Reserve one line so fallback label never pushes DSP buttons */}
      <p className='min-h-3.5 text-3xs text-white/45'>
        {fallbackSourceLabel ?? '\u00a0'}
      </p>
    </div>
  );
}
