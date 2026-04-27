'use client';

import { Search } from 'lucide-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';
import {
  FIELD_LABEL,
  type FilterField,
  type FilterPill,
  HAS_VALUES,
  SLASH_ALIAS,
  STATUS_VALUES,
} from './pill-search.types';

export interface PillSearchProps {
  /**
   * Whether the search surface is mounted in an "active" / focused state.
   * Drives both the imperative input focus on mount and whether the
   * suggestion dropdown is allowed to render.
   */
  readonly active: boolean;
  readonly pills: readonly FilterPill[];
  readonly onPillsChange: (next: FilterPill[]) => void;
  /** Distinct artist names to surface as suggestions. */
  readonly artistOptions: readonly string[];
  /** Distinct title strings (e.g. release titles, track titles). */
  readonly titleOptions: readonly string[];
  /** Distinct album names. */
  readonly albumOptions: readonly string[];
  /** Called when the user hits Esc on an empty input or focus leaves the surface. */
  readonly onClose: () => void;
}

type Suggestion =
  | { kind: 'value'; field: FilterField; value: string; score: number }
  | { kind: 'field'; field: FilterField; score: number };

function fuzzy(needle: string, hay: string): number {
  if (!needle) return 1;
  const n = needle.toLowerCase();
  const h = hay.toLowerCase();
  if (h === n) return 100;
  if (h.startsWith(n)) return 80;
  if (h.includes(n)) return 60;
  const initials = h
    .split(/[^a-z0-9]+/)
    .map(w => w[0])
    .join('');
  if (initials.startsWith(n)) return 70;
  let i = 0;
  for (const c of h) {
    if (c === n[i]) i++;
    if (i === n.length) return 30;
  }
  return 0;
}

type SlashParse =
  | null
  | { kind: 'choosing'; query: string }
  | { kind: 'scoped'; field: FilterField; query: string };

function parseSlash(text: string): SlashParse {
  if (!text.startsWith('/')) return null;
  const rest = text.slice(1);
  const space = rest.indexOf(' ');
  if (space === -1) return { kind: 'choosing', query: rest };
  const cmd = rest.slice(0, space).toLowerCase();
  const query = rest.slice(space + 1);
  const aliased = SLASH_ALIAS[cmd];
  if (aliased) return { kind: 'scoped', field: aliased, query };
  const matched = (Object.keys(FIELD_LABEL) as FilterField[]).find(
    f => f === cmd || FIELD_LABEL[f].toLowerCase() === cmd
  );
  if (matched) return { kind: 'scoped', field: matched, query };
  return { kind: 'choosing', query: rest };
}

function fieldValueOptions(
  field: FilterField,
  artistOptions: readonly string[],
  titleOptions: readonly string[],
  albumOptions: readonly string[]
): readonly string[] {
  switch (field) {
    case 'artist':
      return artistOptions;
    case 'title':
      return titleOptions;
    case 'album':
      return albumOptions;
    case 'status':
      return STATUS_VALUES;
    case 'has':
      return HAS_VALUES;
  }
}

function newPillId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  // Browser without randomUUID (rare, but pre-Safari 15.4 etc.) — fall back
  // to a counter-based id that's still unique within the same module load.
  newPillIdFallbackCounter += 1;
  return `pill-${Date.now()}-${newPillIdFallbackCounter}`;
}
let newPillIdFallbackCounter = 0;

/**
 * PillSearch — Linear/Notion-style pill-based filter input.
 *
 * Composes a row of `<PillChip>`s with a free-text input that opens a
 * suggestion dropdown. Type plain text for fuzzy match across artist /
 * title / album / status / has, or `/<field>` (`/artist`, `/track`, …) to
 * scope subsequent typing to a single field.
 *
 * Pill-level controls: click the operator to flip `is` ↔ `is not`, click the
 * value's `×` to drop a single OR'd value, click the trailing `×` to remove
 * the whole pill. Hitting Backspace on an empty input drops the most recent
 * pill. Esc on an empty input fires `onClose`.
 *
 * Keyboard inside the dropdown: ↑/↓ moves the highlight, Enter commits the
 * highlighted suggestion. Mouse hover updates the highlight; mouse-down
 * commits without losing focus on the input. ARIA combobox-1.2 wired:
 * input has role=combobox + aria-expanded/controls/activedescendant; the
 * dropdown is role=listbox; each suggestion is role=option + aria-selected.
 */
export function PillSearch({
  active,
  pills,
  onPillsChange,
  artistOptions,
  titleOptions,
  albumOptions,
  onClose,
}: PillSearchProps) {
  const [text, setText] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const optionIdPrefix = useId();

  useEffect(() => {
    if (!active) return undefined;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [active]);

  function changeText(value: string) {
    setText(value);
    setHighlight(0);
    setDropdownOpen(value.length > 0);
  }

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!text) return [];
    const slash = parseSlash(text);

    if (slash && slash.kind === 'choosing') {
      const q = slash.query.toLowerCase();
      const fields = Object.keys(FIELD_LABEL) as FilterField[];
      const acc: Suggestion[] = [];
      for (const f of fields) {
        const labelMatch = fuzzy(q, FIELD_LABEL[f]);
        const aliasMatch = Object.entries(SLASH_ALIAS).reduce(
          (m, [alias, target]) =>
            target === f ? Math.max(m, fuzzy(q, alias)) : m,
          0
        );
        const score = Math.max(labelMatch, aliasMatch);
        if (q === '') {
          acc.push({ kind: 'field', field: f, score: 100 });
        } else if (score > 0) {
          acc.push({ kind: 'field', field: f, score });
        }
      }
      return acc.sort((a, b) => b.score - a.score).slice(0, 8);
    }

    if (slash && slash.kind === 'scoped') {
      const q = slash.query.toLowerCase().trim();
      const opts = fieldValueOptions(
        slash.field,
        artistOptions,
        titleOptions,
        albumOptions
      );
      return opts
        .map(v => ({
          kind: 'value' as const,
          field: slash.field,
          value: v,
          score: fuzzy(q, v),
        }))
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
    }

    const q = text.trim();
    const out: Suggestion[] = [];
    artistOptions.forEach(v => {
      const s = fuzzy(q, v);
      if (s > 0)
        out.push({ kind: 'value', field: 'artist', value: v, score: s + 5 });
    });
    titleOptions.forEach(v => {
      const s = fuzzy(q, v);
      if (s > 0)
        out.push({ kind: 'value', field: 'title', value: v, score: s });
    });
    albumOptions.forEach(v => {
      const s = fuzzy(q, v);
      if (s > 0)
        out.push({ kind: 'value', field: 'album', value: v, score: s });
    });
    STATUS_VALUES.forEach(v => {
      const s = fuzzy(q, v);
      if (s > 0)
        out.push({ kind: 'value', field: 'status', value: v, score: s });
    });
    HAS_VALUES.forEach(v => {
      const s = fuzzy(q, v);
      if (s > 0) out.push({ kind: 'value', field: 'has', value: v, score: s });
    });
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 8);
  }, [text, artistOptions, titleOptions, albumOptions]);

  function commitSuggestion(sug: Suggestion) {
    if (sug.kind === 'value') {
      const merged = pills.map(p =>
        p.field === sug.field && p.op === 'is' && !p.values.includes(sug.value)
          ? { ...p, values: [...p.values, sug.value] }
          : p
      );
      const hadField = pills.some(p => p.field === sug.field && p.op === 'is');
      onPillsChange(
        hadField
          ? merged
          : [
              ...pills,
              {
                id: newPillId(),
                field: sug.field,
                op: 'is',
                values: [sug.value],
              },
            ]
      );
      setText('');
      setDropdownOpen(false);
      setHighlight(0);
    } else {
      setText(`/${FIELD_LABEL[sug.field]} `);
      setDropdownOpen(true);
      setHighlight(0);
    }
  }

  function togglePillOp(id: string) {
    onPillsChange(
      pills.map(p =>
        p.id === id ? { ...p, op: p.op === 'is' ? 'is not' : 'is' } : p
      )
    );
  }
  function removePill(id: string) {
    onPillsChange(pills.filter(p => p.id !== id));
  }
  function removeValue(pillId: string, value: string) {
    onPillsChange(
      pills
        .map(p =>
          p.id === pillId
            ? { ...p, values: p.values.filter(v => v !== value) }
            : p
        )
        .filter(p => p.values.length > 0)
    );
  }

  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(suggestions.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const sug = suggestions[highlight];
      if (sug) commitSuggestion(sug);
    } else if (e.key === 'Backspace' && text === '' && pills.length > 0) {
      e.preventDefault();
      onPillsChange(pills.slice(0, -1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (text) {
        changeText('');
      } else {
        onClose();
      }
    }
  }

  const dropdownVisible = active && dropdownOpen && suggestions.length > 0;
  const activeOptionId = dropdownVisible
    ? `${optionIdPrefix}-${highlight}`
    : undefined;

  return (
    <div ref={wrapperRef} className='relative w-full'>
      <div className='flex items-center gap-1.5 flex-wrap min-h-7 pr-1'>
        <Search
          className='h-3.5 w-3.5 text-quaternary-token shrink-0'
          strokeWidth={2.25}
        />
        {pills.map(p => (
          <PillChip
            key={p.id}
            pill={p}
            onToggleOp={() => togglePillOp(p.id)}
            onRemove={() => removePill(p.id)}
            onRemoveValue={v => removeValue(p.id, v)}
          />
        ))}
        <input
          ref={inputRef}
          type='text'
          value={text}
          onChange={e => changeText(e.target.value)}
          onKeyDown={onInputKey}
          onBlur={e => {
            const next = e.relatedTarget as Node | null;
            if (next && wrapperRef.current?.contains(next)) return;
            setDropdownOpen(false);
          }}
          role='combobox'
          aria-label='Filter tracks'
          aria-expanded={dropdownVisible}
          aria-controls={listboxId}
          aria-autocomplete='list'
          aria-activedescendant={activeOptionId}
          placeholder={
            pills.length === 0
              ? 'Type to filter — / for fields'
              : 'and… (/ for fields)'
          }
          className='flex-1 min-w-[120px] bg-transparent text-[13px] text-primary-token placeholder:text-tertiary-token outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500/30 rounded-sm'
        />
        <button
          type='button'
          onClick={onClose}
          className='shrink-0 inline-flex items-center h-5 px-1.5 rounded text-[10px] font-caption uppercase tracking-[0.06em] text-quaternary-token hover:text-primary-token hover:bg-surface-1/60 transition-colors duration-150 ease-out'
          aria-label='Close search'
        >
          Esc
        </button>
      </div>

      {dropdownVisible && (
        <div
          id={listboxId}
          role='listbox'
          tabIndex={-1}
          className='absolute left-0 right-0 top-9 z-40 rounded-lg border border-(--linear-app-shell-border) bg-(--linear-app-content-surface) shadow-[0_18px_60px_rgba(0,0,0,0.32)] py-1 max-h-[320px] overflow-y-auto'
        >
          {suggestions.map((sug, i) => {
            const optionId = `${optionIdPrefix}-${i}`;
            return (
              <button
                key={`${sug.kind}-${sug.kind === 'value' ? sug.field + sug.value : sug.field}`}
                id={optionId}
                role='option'
                aria-selected={i === highlight}
                type='button'
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={e => {
                  e.preventDefault();
                  commitSuggestion(sug);
                }}
                className={cn(
                  'w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors duration-100 ease-out',
                  i === highlight
                    ? 'bg-cyan-500/10 text-primary-token'
                    : 'text-secondary-token hover:bg-surface-1/60'
                )}
              >
                <span
                  className={cn(
                    'inline-flex items-center h-[18px] px-1.5 rounded text-[10px] font-caption uppercase tracking-[0.06em]',
                    i === highlight
                      ? 'bg-cyan-500/15 text-cyan-300'
                      : 'bg-surface-1 text-tertiary-token'
                  )}
                >
                  {FIELD_LABEL[sug.field]}
                </span>
                <span className='flex-1 truncate'>
                  {sug.kind === 'value' ? (
                    sug.value
                  ) : (
                    <span className='text-tertiary-token italic'>
                      Filter by {FIELD_LABEL[sug.field].toLowerCase()}…
                    </span>
                  )}
                </span>
                {i === highlight && (
                  <kbd className='text-[10px] text-quaternary-token shrink-0'>
                    ↵
                  </kbd>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface PillChipProps {
  readonly pill: FilterPill;
  readonly onToggleOp: () => void;
  readonly onRemove: () => void;
  readonly onRemoveValue: (value: string) => void;
}

function PillChip({
  pill,
  onToggleOp,
  onRemove,
  onRemoveValue,
}: PillChipProps) {
  return (
    <span className='group/pill inline-flex items-center h-[22px] rounded-md border border-cyan-500/30 bg-cyan-500/10 text-[11.5px] font-caption text-secondary-token tracking-[-0.005em] overflow-hidden'>
      <span className='px-1.5 text-cyan-300/90 uppercase text-[10px] tracking-[0.06em] border-r border-cyan-500/20'>
        {FIELD_LABEL[pill.field]}
      </span>
      <button
        type='button'
        onClick={onToggleOp}
        className='px-1.5 text-tertiary-token hover:text-primary-token transition-colors duration-150 ease-out'
        title='Toggle is / is not'
      >
        {pill.op}
      </button>
      <span className='inline-flex items-center gap-0.5 pr-0.5'>
        {pill.values.map((v, i) => (
          <span key={v} className='inline-flex items-center'>
            {i > 0 && (
              <span className='px-0.5 text-quaternary-token uppercase text-[10px]'>
                or
              </span>
            )}
            <span className='inline-flex items-center bg-cyan-500/15 px-1.5 h-[18px] rounded text-cyan-100/95'>
              {v}
              <button
                type='button'
                onClick={() => onRemoveValue(v)}
                className='ml-1 text-cyan-300/70 hover:text-cyan-100 transition-colors duration-150 ease-out'
                aria-label={`Remove ${v}`}
              >
                ×
              </button>
            </span>
          </span>
        ))}
      </span>
      <button
        type='button'
        onClick={onRemove}
        className='px-1.5 text-cyan-300/70 hover:text-cyan-100 transition-colors duration-150 ease-out'
        aria-label='Remove filter'
      >
        ×
      </button>
    </span>
  );
}
