'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';

export interface LyricsListLine {
  /** Time offset into the track in seconds — used for the timestamp prefix. */
  readonly at: number;
  readonly text: string;
}

export interface LyricsListProps {
  readonly lines: readonly LyricsListLine[];
  /** Click-to-seek handler. Omit to render rows non-interactive. */
  readonly onSeek?: (sec: number) => void;
  /** Edit affordance click handler. Omit to hide the edit button. */
  readonly onEdit?: () => void;
  /** Override the panel title (defaults to "Lyrics"). */
  readonly title?: string;
  /** Override the edit button label (defaults to "Edit"). */
  readonly editLabel?: string;
  readonly className?: string;
}

/**
 * Formats seconds to a `m:ss` string for lyric timestamps.
 * Returns '0:00' for non-finite or negative inputs (defensive for prod data).
 */
function formatLyricsTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Memoized row renderer for a single lyric line in the drawer.
 * Renders a timestamp + text as a focusable seek button.
 * Applies canonical shell focus ring (with offset) + DESIGN.md subtle motion.
 * Extracted + memoized to avoid re-renders on high-churn lyric lists over real prod data.
 */
const LyricListRow = memo(function LyricListRow({
  line,
  onSeek,
  disabled,
}: {
  readonly line: LyricsListLine;
  readonly onSeek?: (sec: number) => void;
  readonly disabled: boolean;
}) {
  return (
    <button
      type='button'
      onClick={() => onSeek?.(line.at)}
      disabled={disabled}
      className='group/lyric w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-xs text-secondary-token hover:bg-surface-1/40 hover:text-primary-token disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page) transition-colors duration-subtle ease-subtle text-left'
    >
      <span className='shrink-0 w-9 pt-0.5 text-3xs tabular-nums text-quaternary-token group-hover/lyric:text-tertiary-token transition-colors duration-subtle ease-subtle'>
        {formatLyricsTime(line.at)}
      </span>
      <span className='flex-1 leading-snug'>{line.text}</span>
    </button>
  );
});

/**
 * LyricsList — drawer-embedded lyric lines with click-to-seek
 * timestamps. Each row shows `m:ss` on the left, the lyric text on
 * the right; clicking a row fires `onSeek(at)`.
 *
 * Distinct from the full-screen `LyricsView`: this is the calmer
 * drawer-tab variant (no playhead, no J/K nav, no edit mode wired
 * into the rows). When you need the full editor surface, use
 * `LyricsView` from this same shell directory.
 *
 * @example
 * ```tsx
 * <LyricsList
 *   lines={track.lyrics}
 *   onSeek={sec => audioPlayer.seek(sec)}
 *   onEdit={() => openLyricsEditor(track.id)}
 * />
 * ```
 */
export function LyricsList({
  lines,
  onSeek,
  onEdit,
  title = 'Lyrics',
  editLabel = 'Edit',
  className,
}: LyricsListProps) {
  return (
    <div className={cn('px-4 py-4', className)}>
      <div className='flex items-center justify-between pb-2'>
        <p className='text-3xs uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
          {title}
        </p>
        {onEdit && (
          <button
            type='button'
            onClick={onEdit}
            className='text-3xs uppercase tracking-[0.06em] text-quaternary-token hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-bg-page) rounded transition-colors duration-subtle ease-subtle'
          >
            {editLabel}
          </button>
        )}
      </div>
      <ol className='flex flex-col -mx-2'>
        {lines.map(line => (
          <li key={`${line.at}-${line.text}`}>
            <LyricListRow line={line} onSeek={onSeek} disabled={!onSeek} />
          </li>
        ))}
      </ol>
    </div>
  );
}
