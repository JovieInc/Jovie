'use client';

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

function formatLyricsTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
        <p className='text-[10px] uppercase tracking-[0.08em] text-quaternary-token font-semibold'>
          {title}
        </p>
        {onEdit && (
          <button
            type='button'
            onClick={onEdit}
            className='text-[10.5px] uppercase tracking-[0.06em] text-quaternary-token hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token rounded transition-colors duration-150 ease-out'
          >
            {editLabel}
          </button>
        )}
      </div>
      <ol className='flex flex-col -mx-2'>
        {lines.map(line => (
          <li key={`${line.at}-${line.text}`}>
            <button
              type='button'
              onClick={() => onSeek?.(line.at)}
              disabled={!onSeek}
              className='group/lyric w-full flex items-start gap-2 px-2 py-1.5 rounded-md text-[12.5px] text-secondary-token hover:bg-surface-1/40 hover:text-primary-token disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-secondary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out text-left'
            >
              <span className='shrink-0 w-9 pt-0.5 text-[10.5px] tabular-nums text-quaternary-token group-hover/lyric:text-tertiary-token transition-colors duration-150 ease-out'>
                {formatLyricsTime(line.at)}
              </span>
              <span className='flex-1 leading-snug'>{line.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
