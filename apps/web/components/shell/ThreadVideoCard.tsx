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
    <div className='rounded-xl border border-(--linear-app-shell-border) bg-(--surface-0)/40 overflow-hidden'>
      <Thumb
        {...(onPlay
          ? {
              type: 'button' as const,
              onClick: onPlay,
              'aria-label': `Play ${title}`,
            }
          : {})}
        className='group/vid relative w-full aspect-[16/9] block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token'
      >
        <span
          aria-hidden='true'
          className='absolute inset-0'
          style={{
            background:
              'radial-gradient(ellipse at 60% 40%, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0) 60%), linear-gradient(135deg, hsl(220, 30%, 12%), hsl(220, 30%, 4%))',
          }}
        />
        <span className='absolute inset-0 grid place-items-center'>
          <span
            className={
              onPlay
                ? 'h-12 w-12 rounded-full bg-white/95 text-black grid place-items-center group-hover/vid:scale-105 transition-transform duration-200 ease-out'
                : 'h-12 w-12 rounded-full bg-white/40 text-black grid place-items-center'
            }
          >
            <Play
              className='h-4 w-4 translate-x-px'
              strokeWidth={2.5}
              fill='currentColor'
            />
          </span>
        </span>
        <span className='absolute bottom-2 right-2 inline-flex items-center h-5 px-1.5 rounded text-[10px] font-caption tabular-nums text-primary-token bg-black/60 backdrop-blur'>
          {formatDuration(durationSec)}
        </span>
      </Thumb>
      <div className='flex items-center gap-2 px-3 h-9 border-t border-(--linear-app-shell-border)/60'>
        <Mic2 className='h-3 w-3 text-cyan-300/80' strokeWidth={2.25} />
        <span className='flex-1 text-[11.5px] text-tertiary-token truncate'>
          {title}
        </span>
        {onFullscreen && (
          <ThreadCardIconBtn label='Full-screen' onClick={onFullscreen}>
            <Maximize2 className='h-3 w-3' strokeWidth={2.25} />
          </ThreadCardIconBtn>
        )}
      </div>
    </div>
  );
}
