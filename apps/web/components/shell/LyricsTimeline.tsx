'use client';

import type { MouseEvent } from 'react';
import { formatTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';
import type { LyricLine } from './LyricsView.types';

/**
 * LyricsTimeline — sticky-bottom scrub bar with cue dots per lyric line.
 *
 * Click anywhere on the bar to seek. Active cue (the line whose `startSec`
 * is closest-but-not-past the playhead) is rendered larger + tinted.
 *
 * Pure presentational — controlled by `currentTimeSec` + `onSeek`.
 */
export function LyricsTimeline({
  durationSec,
  currentTimeSec,
  lines,
  activeIndex,
  onSeek,
  className,
}: {
  readonly durationSec: number;
  readonly currentTimeSec: number;
  readonly lines: readonly LyricLine[];
  readonly activeIndex: number;
  readonly onSeek: (sec: number) => void;
  readonly className?: string;
}) {
  const safeDuration =
    Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  const safeCurrent = Number.isFinite(currentTimeSec) ? currentTimeSec : 0;
  const pct =
    safeDuration > 0
      ? Math.max(0, Math.min(100, (safeCurrent / safeDuration) * 100))
      : 0;

  function handleScrub(e: MouseEvent<HTMLButtonElement>) {
    if (safeDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(safeDuration, ratio * safeDuration)));
  }

  return (
    <div
      className={cn(
        'shrink-0 border-t border-(--linear-app-shell-border)/50 bg-(--linear-app-content-surface)/95 backdrop-blur-md px-4 py-3',
        className
      )}
    >
      <div className='flex items-center gap-3'>
        <span className='text-[10px] tabular-nums text-quaternary-token w-9 text-right shrink-0'>
          {formatTime(safeCurrent)}
        </span>
        <button
          type='button'
          onClick={handleScrub}
          className='relative flex-1 h-6 rounded-full grid focus:outline-none'
          aria-label='Lyric timeline'
        >
          <span className='pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-(--linear-app-shell-border)' />
          <span
            className='pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 h-px bg-cyan-400/80 transition-[width] duration-150 ease-out'
            style={{ width: `${pct}%` }}
          />
          {lines.map((line, i) => {
            const left =
              safeDuration > 0
                ? Math.max(
                    0,
                    Math.min(100, (line.startSec / safeDuration) * 100)
                  )
                : 0;
            const isActive = i === activeIndex;
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: cue dots are positional; multiple lines may share startSec mid-edit
                key={i}
                aria-hidden='true'
                className={cn(
                  'pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full transition-colors duration-150 ease-out',
                  isActive
                    ? 'h-2 w-2 bg-cyan-300 shadow-[0_0_0_2px_rgb(34_211_238/0.18)]'
                    : 'h-1 w-1 bg-quaternary-token/80'
                )}
                style={{ left: `${left}%` }}
              />
            );
          })}
          <span
            aria-hidden='true'
            className='pointer-events-none absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-cyan-400 shadow-[0_0_0_3px_rgb(34_211_238/0.18)] transition-[left] duration-150 ease-out'
            style={{ left: `${pct}%` }}
          />
        </button>
        <span className='text-[10px] tabular-nums text-quaternary-token w-9 text-left shrink-0'>
          {formatTime(safeDuration)}
        </span>
      </div>
    </div>
  );
}
