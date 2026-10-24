'use client';

import { GripVertical } from 'lucide-react';
import React from 'react';
import { formatTime } from '@/lib/format-time';
import { cn } from '@/lib/utils';
import type { LyricLine } from './LyricsView.types';

// Ion-accent pill-chip + tinted bg used for selected/focused rows in edit mode.
// Mirrors the shell-v1 SELECTED_ROW_CLASSES vocabulary so the row treatment
// reads consistently across views.
const SELECTED_ROW_CLASSES = [
  'data-[selected]:bg-accent/[0.06]',
  'data-[focused]:bg-accent/[0.04]',
  'before:absolute before:left-0.5 before:top-1/2 before:-translate-y-1/2',
  'before:h-3.5 before:w-1 before:rounded-full before:bg-accent/0',
  'data-[focused]:before:bg-accent/85',
  'data-[selected]:before:bg-accent/85',
  'before:transition-colors before:duration-subtle before:ease-subtle',
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
 *
 * Memoized for shell handoff rot 9 (high-churn over real timed LyricLine
 * data from prod tracks). DS subtle motion + canonical focus rings applied
 * to interactive controls.
 */
export const LyricRow = React.memo(function LyricRow({
  line,
  index,
  isActive,
  isFocused,
  editing,
  onFocus,
  onSeek,
  onStamp,
  onChangeText,
  interactive = true,
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
  readonly interactive?: boolean;
}) {
  if (!editing) {
    if (!interactive) {
      return (
        <li className='text-center text-xl leading-snug font-display text-secondary-token'>
          {line.text}
        </li>
      );
    }

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
            'transition-[color,opacity,transform] duration-subtle ease-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55',
            isActive
              ? 'text-primary-token text-3xl leading-tight font-display opacity-100'
              : // No opacity fade on the resting line: at opacity-60 the
                // tertiary token drops below WCAG AA contrast (axe
                // color-contrast). The quieter tertiary color alone carries
                // the inactive read; hover still brightens to secondary.
                'text-tertiary-token text-xl leading-snug font-display hover:text-secondary-token'
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
        'group/lyricedit relative flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-subtle ease-subtle',
        !isFocused && !isActive && 'hover:bg-surface-1/40',
        SELECTED_ROW_CLASSES
      )}
    >
      <span
        aria-hidden='true'
        className='shrink-0 text-quaternary-token/70 hover:text-secondary-token cursor-grab active:cursor-grabbing transition-colors duration-subtle ease-subtle'
        title={`Drag to reorder line ${index + 1}`}
      >
        <GripVertical className='h-3.5 w-3.5' strokeWidth={2.25} />
      </span>
      <button
        type='button'
        onClick={onStamp}
        className={cn(
          'shrink-0 h-6 px-1.5 rounded text-3xs tabular-nums font-caption transition-colors duration-subtle ease-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55',
          isActive
            ? 'bg-accent/15 text-accent border border-accent/30'
            : 'text-tertiary-token bg-surface-1 border border-(--app-shell-border) hover:text-primary-token hover:border-accent/40'
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
          'flex-1 min-w-0 bg-transparent outline-none text-mid font-display placeholder:text-quaternary-token/60',
          isActive ? 'text-primary-token' : 'text-secondary-token'
        )}
        placeholder='Lyric line'
        aria-label={`Lyric line ${index + 1}`}
      />
    </li>
  );
});
