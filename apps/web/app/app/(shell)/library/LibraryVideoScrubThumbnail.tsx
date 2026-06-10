'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { formatLibraryScrubTime } from './library-thumbnail-utils';

export interface LibraryVideoScrubThumbnailProps {
  readonly title: string;
  readonly videoUrl: string;
  readonly posterUrl: string | null;
  readonly durationMs: number | null;
  readonly scrubRatio: number;
  readonly isActive: boolean;
  readonly compact?: boolean;
  readonly className?: string;
}

export function LibraryVideoScrubThumbnail({
  title,
  videoUrl,
  posterUrl,
  durationMs,
  scrubRatio,
  isActive,
  compact = false,
  className,
}: LibraryVideoScrubThumbnailProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loadedDurationSeconds, setLoadedDurationSeconds] = useState<
    number | null
  >(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!isActive) {
      try {
        video.pause();
      } catch {
        // jsdom does not implement HTMLMediaElement.pause.
      }
      video.currentTime = 0;
      return;
    }

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration > 0) {
      video.currentTime = scrubRatio * duration;
    }
  }, [isActive, scrubRatio]);

  const effectiveDurationMs =
    durationMs && durationMs > 0
      ? durationMs
      : loadedDurationSeconds
        ? loadedDurationSeconds * 1000
        : null;

  return (
    <div
      data-testid='library-video-scrub-thumbnail'
      aria-hidden={!isActive}
      className={cn(
        'system-b-library-media-scrub pointer-events-none absolute inset-0',
        isActive
          ? 'system-b-library-media-scrub--active'
          : 'system-b-library-media-scrub--idle',
        className
      )}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={posterUrl ?? undefined}
        muted
        playsInline
        preload='metadata'
        aria-hidden='true'
        tabIndex={-1}
        className={cn(
          'h-full w-full object-cover',
          isActive ? 'opacity-100' : 'opacity-0'
        )}
        onLoadedMetadata={event => {
          const nextDuration = event.currentTarget.duration;
          setLoadedDurationSeconds(
            Number.isFinite(nextDuration) && nextDuration > 0
              ? nextDuration
              : null
          );
        }}
      />
      <div
        className={cn(
          'system-b-library-video-scrub-ui pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-2',
          compact
            ? 'system-b-library-video-scrub-ui--compact'
            : 'system-b-library-video-scrub-ui--card'
        )}
      >
        <span className='system-b-library-video-scrub-label truncate'>
          Video preview
        </span>
        <span className='system-b-library-waveform-time tabular-nums'>
          {formatLibraryScrubTime(effectiveDurationMs, scrubRatio)}
        </span>
      </div>
      <span className='sr-only'>{`Scrub video preview for ${title}`}</span>
    </div>
  );
}
