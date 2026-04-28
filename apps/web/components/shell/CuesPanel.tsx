'use client';

import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Cue } from './cues.types';

export interface CuesPanelProps {
  /** Cue list ordered by `at` ascending. */
  readonly cues: readonly Cue[];
  /** Total duration in seconds — used to plot cues on the timeline ribbon. */
  readonly durationSec: number;
  /** Called with the cue's `at` time when the user clicks a row. */
  readonly onSeek?: (sec: number) => void;
  /** Override the panel header title (defaults to "Cues"). */
  readonly title?: string;
  readonly className?: string;
}

function formatCueTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * CuesPanel — entity drawer panel listing audio cues (intro / verse /
 * chorus / drop / bridge / outro). Renders a thin timeline ribbon at
 * the top with each cue plotted against duration, then a vertical list
 * where each row reads as a track entry: timestamp on hover swaps to a
 * play affordance, label in the middle, kind on the right.
 *
 * Click a row to fire `onSeek(at)` — callers wire that into their
 * audio player.
 *
 * Reuses the `Cue` type from `row-waveform.types.ts` so a single cue
 * shape flows through the waveform AND its sibling drawer panel.
 *
 * @example
 * ```tsx
 * <CuesPanel
 *   cues={track.cues}
 *   durationSec={track.durationSec}
 *   onSeek={sec => audioPlayer.seek(sec)}
 * />
 * ```
 */
export function CuesPanel({
  cues,
  durationSec,
  onSeek,
  title = 'Cues',
  className,
}: CuesPanelProps) {
  const totalForRibbon = Math.max(durationSec, 1);
  return (
    <div className={cn('px-4 py-4', className)}>
      <div className='flex items-center justify-between pb-2'>
        <p className='text-[10px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
          {title}
        </p>
        <span className='text-[10.5px] tabular-nums text-tertiary-token'>
          {cues.length}
        </span>
      </div>
      <div className='relative h-1 rounded-full bg-(--surface-2)'>
        {cues.map(c => {
          const pct = (c.at / totalForRibbon) * 100;
          return (
            <span
              key={`ribbon-${c.at}-${c.label}`}
              aria-hidden='true'
              className='absolute top-1/2 -translate-y-1/2 h-2 w-0.5 rounded-full bg-cyan-300/60'
              style={{ left: `${pct}%` }}
            />
          );
        })}
      </div>
      <ul className='mt-3 flex flex-col -mx-2'>
        {cues.map(c => (
          <li key={`row-${c.at}-${c.label}`}>
            <button
              type='button'
              onClick={() => onSeek?.(c.at)}
              disabled={!onSeek}
              className='group/cue w-full flex items-center gap-2 h-8 px-2 rounded-md text-[12.5px] text-secondary-token hover:bg-surface-1/40 hover:text-primary-token disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out'
            >
              <span className='relative w-9 shrink-0'>
                <span
                  className={cn(
                    'absolute inset-0 grid place-items-start tabular-nums text-[10.5px] text-quaternary-token',
                    onSeek &&
                      'opacity-100 group-hover/cue:opacity-0 transition-opacity duration-150 ease-out'
                  )}
                >
                  {formatCueTime(c.at)}
                </span>
                {onSeek && (
                  <span className='absolute inset-0 grid place-items-center text-primary-token opacity-0 group-hover/cue:opacity-100 transition-opacity duration-150 ease-out'>
                    <Play
                      className='h-3 w-3 translate-x-px'
                      strokeWidth={2.5}
                      fill='currentColor'
                    />
                  </span>
                )}
              </span>
              <span className='flex-1 text-left truncate'>{c.label}</span>
              <span className='text-[10px] uppercase tracking-[0.06em] text-quaternary-token capitalize'>
                {c.kind}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
