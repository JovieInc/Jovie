'use client';

import { GripVertical } from 'lucide-react';
import { formatTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';
import type { LyricLine } from './LyricsView.types';

// Cyan pill-chip + tinted bg used for selected/focused rows in edit mode.
// Mirrors the shell-v1 SELECTED_ROW_CLASSES vocabulary so the row treatment
// reads consistently across views.
const SELECTED_ROW_CLASSES = [
  'data-[selected]:bg-cyan-300/[0.06]',
  'data-[focused]:bg-cyan-300/[0.04]',
  'before:absolute before:left-0.5 before:top-1/2 before:-translate-y-1/2',
  'before:h-3.5 before:w-[3px] before:rounded-full before:bg-cyan-300/0',
  'data-[focused]:before:bg-cyan-300/85',
  'data-[selected]:before:bg-cyan-300/85',
  'before:transition-colors before:duration-150 before:ease-out',
].join(' ');

/**
 * LyricRow — single line in the lyrics list.
 *
 * Display mode: a full-width seek button styled like a centered lyric. Big
 * for the active line, soft-faded otherwise.
 *
 * Edit mode: grip + time-stamp button + inline editable text. The input's
 * focus event drives the row's `onFocus`; no row-level click handler.
 *
 * Pure presentational — caller owns line state, focus, edit mode.
 */
export function LyricRow({
  line,
  index,
  isActive,
  isFocused,
  editing,
  onFocus,
  onSeek,
  onStamp,
  onChangeText,
}: {
  readonly line: LyricLine;
  readonly index: number;
  readonly isActive: boolean;
  readonly isFocused: boolean;
  readonly editing: boolean;
  readonly onFocus: () => void;
  readonly onSeek: () => void;
  readonly onStamp: () => void;
  readonly onChangeText: (text: string) => void;
}) {
  if (!editing) {
    // Display mode — the entire row is a seek button. Native <button>
    // gives proper keyboard + Enter/Space + focus ring for free.
    return (
      <li>
        <button
          type='button'
          onClick={onSeek}
          data-focused={isFocused && !isActive ? '' : undefined}
          className={cn(
            'group/lyric block w-full text-center cursor-pointer select-none bg-transparent border-0 p-0',
            'transition-[color,opacity,transform] duration-[250ms] ease-out',
            isActive
              ? 'text-primary-token text-[28px] leading-[1.25] font-display tracking-[-0.018em] opacity-100'
              : 'text-tertiary-token text-[20px] leading-[1.35] font-display tracking-[-0.012em] opacity-60 hover:opacity-90 hover:text-secondary-token'
          )}
        >
          {line.text}
        </button>
      </li>
    );
  }

  // Edit mode — input owns focus; row has no click handler. Clicking the
  // input naturally focuses it, which calls onFocus.
  return (
    <li
      data-focused={isFocused && !isActive ? '' : undefined}
      data-selected={isActive ? '' : undefined}
      className={cn(
        'group/lyricedit relative flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-150 ease-out',
        !isFocused && !isActive && 'hover:bg-surface-1/40',
        SELECTED_ROW_CLASSES
      )}
    >
      <span
        aria-hidden='true'
        className='shrink-0 text-quaternary-token/70 hover:text-secondary-token cursor-grab active:cursor-grabbing transition-colors duration-150 ease-out'
        title={`Drag to reorder line ${index + 1}`}
      >
        <GripVertical className='h-3.5 w-3.5' strokeWidth={2.25} />
      </span>
      <button
        type='button'
        onClick={onStamp}
        className={cn(
          'shrink-0 h-6 px-1.5 rounded text-[10.5px] tabular-nums font-caption transition-colors duration-150 ease-out',
          isActive
            ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
            : 'text-tertiary-token bg-surface-1 border border-(--linear-app-shell-border) hover:text-primary-token hover:border-cyan-500/40'
        )}
        title='Stamp this line to the current playhead (Enter)'
      >
        {formatTime(line.startSec)}
      </button>
      <input
        type='text'
        value={line.text}
        onChange={e => onChangeText(e.target.value)}
        onFocus={onFocus}
        className={cn(
          'flex-1 min-w-0 bg-transparent outline-none text-[15px] font-display tracking-[-0.012em] placeholder:text-quaternary-token/60',
          isActive ? 'text-primary-token' : 'text-secondary-token'
        )}
        placeholder='Lyric line'
        aria-label={`Lyric line ${index + 1}`}
      />
    </li>
  );
}
