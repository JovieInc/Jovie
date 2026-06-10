'use client';

import { useId, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatLibraryScrubTime } from './library-thumbnail-utils';
import {
  LIBRARY_WAVEFORM_PEAK_COUNT,
  libraryWaveformPeaks,
} from './library-waveform-peaks';

const WAVEFORM_WIDTH = 480;
const WAVEFORM_HEIGHT = 56;
const WAVEFORM_CENTER_Y = WAVEFORM_HEIGHT / 2;
const WAVEFORM_AMP = WAVEFORM_HEIGHT / 2 - 2;

export interface LibraryAudioWaveformThumbnailProps {
  readonly title: string;
  readonly waveformSeed: number;
  readonly durationMs: number | null;
  readonly scrubRatio: number;
  readonly isActive: boolean;
  readonly compact?: boolean;
  readonly className?: string;
}

export function LibraryAudioWaveformThumbnail({
  title,
  waveformSeed,
  durationMs,
  scrubRatio,
  isActive,
  compact = false,
  className,
}: LibraryAudioWaveformThumbnailProps) {
  const peaks = useMemo(
    () => libraryWaveformPeaks(waveformSeed),
    [waveformSeed]
  );
  const clipId = useId();
  const stride = WAVEFORM_WIDTH / LIBRARY_WAVEFORM_PEAK_COUNT;
  const playedWidth = scrubRatio * WAVEFORM_WIDTH;

  return (
    <div
      data-testid='library-audio-waveform-thumbnail'
      aria-hidden={!isActive}
      className={cn(
        'system-b-library-media-scrub pointer-events-none absolute inset-0 flex flex-col justify-end',
        isActive
          ? 'system-b-library-media-scrub--active'
          : 'system-b-library-media-scrub--idle',
        className
      )}
    >
      <div
        className={cn(
          'system-b-library-waveform-shell w-full',
          compact
            ? 'system-b-library-waveform-shell--compact'
            : 'system-b-library-waveform-shell--card'
        )}
      >
        <svg
          viewBox={`0 0 ${WAVEFORM_WIDTH} ${WAVEFORM_HEIGHT}`}
          className='block h-full w-full overflow-visible'
          preserveAspectRatio='none'
          aria-hidden='true'
        >
          <defs>
            <clipPath id={clipId}>
              <rect x='0' y='0' width={playedWidth} height={WAVEFORM_HEIGHT} />
            </clipPath>
          </defs>

          <g className='system-b-library-waveform-unplayed'>
            {peaks.map((height, index) => {
              const x = index * stride + stride / 2;
              const half = height * WAVEFORM_AMP;
              return (
                <line
                  // biome-ignore lint/suspicious/noArrayIndexKey: deterministic peak index for a stable seed
                  key={index}
                  x1={x}
                  x2={x}
                  y1={WAVEFORM_CENTER_Y - half}
                  y2={WAVEFORM_CENTER_Y + half}
                  stroke='currentColor'
                  strokeWidth='1.4'
                  strokeLinecap='round'
                  vectorEffect='non-scaling-stroke'
                />
              );
            })}
          </g>

          <g
            clipPath={`url(#${clipId})`}
            className='system-b-library-waveform-played'
          >
            {peaks.map((height, index) => {
              const x = index * stride + stride / 2;
              const half = height * WAVEFORM_AMP;
              return (
                <line
                  // biome-ignore lint/suspicious/noArrayIndexKey: deterministic peak index for a stable seed
                  key={index}
                  x1={x}
                  x2={x}
                  y1={WAVEFORM_CENTER_Y - half}
                  y2={WAVEFORM_CENTER_Y + half}
                  stroke='currentColor'
                  strokeWidth='1.6'
                  strokeLinecap='round'
                  vectorEffect='non-scaling-stroke'
                />
              );
            })}
          </g>

          <line
            x1={playedWidth}
            x2={playedWidth}
            y1={0}
            y2={WAVEFORM_HEIGHT}
            stroke='currentColor'
            strokeWidth='1.2'
            className='system-b-library-waveform-playhead'
            vectorEffect='non-scaling-stroke'
          />
        </svg>

        <span className='system-b-library-waveform-time tabular-nums'>
          {formatLibraryScrubTime(durationMs, scrubRatio)}
        </span>
        <span className='sr-only'>{`Scrub preview for ${title}`}</span>
      </div>
    </div>
  );
}
