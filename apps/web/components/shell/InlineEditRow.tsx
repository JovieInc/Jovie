'use client';

import { Pencil } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

export type InlineEditRowValueTone = 'default' | 'mono' | 'tabular';

export interface InlineEditRowProps {
  /** Label rendered on the left of the row in caption tone. */
  readonly label: string;
  /** Current value rendered as `<dd>`. */
  readonly value: string;
  /**
   * Visual variant for the value. `'mono'` renders in monospace + tracking
   * (e.g. musical key, ISRC). `'tabular'` renders with `tabular-nums` so
   * numbers align across rows (e.g. BPM, length, ID).
   */
  readonly valueTone?: InlineEditRowValueTone;
  /**
   * Called with the committed value when the user hits Enter or blurs an
   * edit. Omit for read-only rows — the row drops its hover affordance and
   * the edit pencil is hidden.
   */
  readonly onCommit?: (next: string) => void;
  readonly className?: string;
}

const TONE_CLASS: Record<InlineEditRowValueTone, string> = {
  default: '',
  mono: 'font-mono tracking-wide',
  tabular: 'tabular-nums',
};

/**
 * InlineEditRow — single label/value row with click-to-edit. Hover the
 * row to surface a small pencil button; click the row, double-click the
 * row, or click the pencil to swap the value into a controlled input.
 * Enter or blur commits; Escape cancels.
 *
 * The row is its own controller — it owns the draft state and fires
 * `onCommit(next)` once. Callers persist the change, then update their
 * `value` prop on the next render.
 *
 * Read-only rows (no `onCommit`) drop the pencil and hover surface so
 * the row never advertises an edit affordance that does nothing.
 *
 * @example
 * ```tsx
 * <dl className='flex flex-col gap-0'>
 *   <InlineEditRow label='Title' value={track.title} onCommit={renameTitle} />
 *   <InlineEditRow label='Key' value={track.key} valueTone='mono' onCommit={updateKey} />
 *   <InlineEditRow label='BPM' value={String(track.bpm)} valueTone='tabular' onCommit={updateBpm} />
 *   <InlineEditRow label='ID' value={track.id} valueTone='tabular' />
 * </dl>
 * ```
 */
export function InlineEditRow({
  label,
  value,
  valueTone = 'default',
  onCommit,
  className,
}: InlineEditRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const readOnly = !onCommit;

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  function enterEdit() {
    if (readOnly) return;
    setDraft(value);
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    if (!readOnly && draft !== value) onCommit?.(draft);
  }

  function cancel() {
    setEditing(false);
    setDraft(value);
  }

  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  }

  const valueClass = cn(
    'flex-1 min-w-0 text-[12.5px] text-secondary-token truncate',
    TONE_CLASS[valueTone]
  );

  if (editing) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 h-8 px-2 rounded-md bg-surface-1/40',
          className
        )}
      >
        <dt className='w-[88px] shrink-0 text-[11px] text-quaternary-token'>
          {label}
        </dt>
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onInputKey}
          aria-label={`Edit ${label}`}
          className={cn(
            valueClass,
            'bg-transparent outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-token rounded-sm'
          )}
        />
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: row click opens an inline edit input above; keyboard activation is on the inner pencil button (a real <button>)
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: same — handlers route to a real button for keyboard users
    // biome-ignore lint/a11y/useKeyWithClickEvents: inner pencil button is the keyboard-accessible affordance
    <div
      className={cn(
        'group/row flex items-center gap-3 h-8 px-2 rounded-md transition-colors duration-150 ease-out',
        readOnly
          ? 'hover:bg-transparent'
          : 'cursor-pointer hover:bg-surface-1/40',
        className
      )}
      onClick={readOnly ? undefined : enterEdit}
      onDoubleClick={readOnly ? undefined : enterEdit}
      title={readOnly ? undefined : 'Click to edit'}
    >
      <dt className='w-[88px] shrink-0 text-[11px] text-quaternary-token'>
        {label}
      </dt>
      <dd className={valueClass}>{value}</dd>
      {!readOnly && (
        <button
          type='button'
          onClick={e => {
            e.stopPropagation();
            enterEdit();
          }}
          aria-label={`Edit ${label}`}
          className='shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-opacity duration-150 ease-out'
        >
          <Pencil className='h-3 w-3' strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}
