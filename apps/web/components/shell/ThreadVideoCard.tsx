'use client';

import { Maximize2, Mic2, Play } from 'lucide-react';
import { ThreadCardIconBtn } from './ThreadCardIconBtn';

export interface ThreadVideoCardProps {
  readonly title: string;
  readonly durationSec: number;
  readonly onPlay?: () => void;
  readonly onFullscreen?: () => void;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Video card — inline thumbnail with a play overlay. Click expand →
 * cinematic full-screen (callers wire `onFullscreen` to their preferred
 * surface, e.g. the lyric-video player). Click the thumbnail itself to
 * fire `onPlay` for inline preview.
 *
 * Both buttons render as non-interactive when their handler is omitted
 * so the UI never advertises a no-op action.
 */
export function ThreadVideoCard({
  title,
  durationSec,
  onPlay,
  onFullscreen,
}: ThreadVideoCardProps) {
  const Thumb = onPlay ? 'button' : 'div';
  return (
    <div className='system-b-thread-media-card'>
      <Thumb
        {...(onPlay
          ? {
              type: 'button' as const,
              onClick: onPlay,
              'aria-label': `Play ${title}`,
            }
          : {})}
        className='system-b-thread-media-preview system-b-thread-video-preview'
      >
        <span aria-hidden='true' className='system-b-thread-video-backdrop' />
        <span className='system-b-thread-play-shell'>
          <span
            className='system-b-thread-play-button'
            data-interactive={onPlay ? 'true' : 'false'}
          >
            <Play
              className='h-4 w-4 translate-x-px'
              strokeWidth={2.5}
              fill='currentColor'
            />
          </span>
        </span>
        <span className='system-b-thread-duration-badge'>
          {formatDuration(durationSec)}
        </span>
      </Thumb>
      <div className='system-b-thread-media-footer'>
        <Mic2 className='system-b-thread-media-icon' strokeWidth={2.25} />
        <span className='system-b-thread-media-label'>{title}</span>
        {onFullscreen && (
          <ThreadCardIconBtn label='Full-screen' onClick={onFullscreen}>
            <Maximize2 className='h-3 w-3' strokeWidth={2.25} />
          </ThreadCardIconBtn>
        )}
      </div>
    </div>
  );
}
