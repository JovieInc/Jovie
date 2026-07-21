'use client';

import { Button } from '@jovie/ui';

import { Search, X } from 'lucide-react';
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
  /** Distinct status values. Defaults to release status values. */
  readonly statusOptions?: readonly string[];
  /** Distinct approval status values. */
  readonly approvalOptions?: readonly string[];
  /** Distinct "has" values. Defaults to release asset values. */
  readonly hasOptions?: readonly string[];
  /** Called when the user hits Esc on an empty input or focus leaves the surface. */
  readonly onClose: () => void;
  readonly ariaLabel?: string;
  readonly placeholder?: string;
  /** Restrict suggestions and slash fields to the route's supported filters. */
  readonly allowedFields?: readonly FilterField[];
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
  albumOptions: readonly string[],
  statusOptions: readonly string[],
  approvalOptions: readonly string[],
  hasOptions: readonly string[]
): readonly string[] {
  switch (field) {
    case 'artist':
      return artistOptions;
    case 'title':
      return titleOptions;
    case 'album':
      return albumOptions;
    case 'status':
      return statusOptions;
    case 'approval':
      return approvalOptions;
    case 'has':
      return hasOptions;
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
  statusOptions = STATUS_VALUES,
  approvalOptions = [],
  hasOptions = HAS_VALUES,
  onClose,
  ariaLabel = 'Filter tracks',
  placeholder = 'Type to filter',
  allowedFields,
}: PillSearchProps) {
  const [text, setText] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const optionIdPrefix = useId();
  const effectiveFields = useMemo(
    () => allowedFields ?? (Object.keys(FIELD_LABEL) as FilterField[]),
    [allowedFields]
  );
  const allowedFieldSet = useMemo(
    () => new Set<FilterField>(effectiveFields),
    [effectiveFields]
  );

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

    if (slash?.kind === 'choosing') {
      const q = slash.query.toLowerCase();
      const acc: Suggestion[] = [];
      for (const f of effectiveFields) {
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

    if (slash?.kind === 'scoped') {
      if (!allowedFieldSet.has(slash.field)) return [];
      const q = slash.query.toLowerCase().trim();
      const opts = fieldValueOptions(
        slash.field,
        artistOptions,
        titleOptions,
        albumOptions,
        statusOptions,
        approvalOptions,
        hasOptions
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
    if (allowedFieldSet.has('artist')) {
      artistOptions.forEach(v => {
        const s = fuzzy(q, v);
        if (s > 0)
          out.push({ kind: 'value', field: 'artist', value: v, score: s + 5 });
      });
    }
    if (allowedFieldSet.has('title')) {
      titleOptions.forEach(v => {
        const s = fuzzy(q, v);
        if (s > 0)
          out.push({ kind: 'value', field: 'title', value: v, score: s });
      });
    }
    if (allowedFieldSet.has('album')) {
      albumOptions.forEach(v => {
        const s = fuzzy(q, v);
        if (s > 0)
          out.push({ kind: 'value', field: 'album', value: v, score: s });
      });
    }
    if (allowedFieldSet.has('status')) {
      statusOptions.forEach(v => {
        const s = fuzzy(q, v);
        if (s > 0)
          out.push({ kind: 'value', field: 'status', value: v, score: s });
      });
    }
    if (allowedFieldSet.has('approval')) {
      approvalOptions.forEach(v => {
        const s = fuzzy(q, v);
        if (s > 0)
          out.push({ kind: 'value', field: 'approval', value: v, score: s });
      });
    }
    if (allowedFieldSet.has('has')) {
      hasOptions.forEach(v => {
        const s = fuzzy(q, v);
        if (s > 0)
          out.push({ kind: 'value', field: 'has', value: v, score: s });
      });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 8);
  }, [
    allowedFieldSet,
    artistOptions,
    titleOptions,
    albumOptions,
    statusOptions,
    approvalOptions,
    hasOptions,
    effectiveFields,
    text,
  ]);

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
    <div ref={wrapperRef} className='relative h-full w-full min-w-0'>
      <div className='flex h-full min-h-0 items-center gap-1.5 overflow-hidden pr-0.5'>
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
          aria-label={ariaLabel}
          data-app-search-field='true'
          aria-expanded={dropdownVisible}
          aria-controls={listboxId}
          aria-autocomplete='list'
          aria-activedescendant={activeOptionId}
          placeholder={pills.length === 0 ? placeholder : 'and…'}
          className='system-b-pill-search-input flex-1 bg-transparent text-primary-token placeholder:text-tertiary-token'
        />
        <Button
          type='button'
          variant='ghost'
          size='sm'
          onClick={onClose}
          className='system-b-pill-search-close h-auto shrink-0'
          aria-label='Close Search'
        >
          Esc
        </Button>
      </div>

      {dropdownVisible && (
        <div
          id={listboxId}
          role='listbox'
          tabIndex={-1}
          className='system-b-pill-search-listbox absolute inset-x-0 top-full mt-1.5 overflow-y-auto py-1'
        >
          {suggestions.map((sug, i) => {
            const optionId = `${optionIdPrefix}-${i}`;
            return (
              <Button
                key={`${sug.kind}-${sug.kind === 'value' ? sug.field + sug.value : sug.field}`}
                id={optionId}
                role='option'
                aria-selected={i === highlight}
                type='button'
                variant='ghost'
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={e => {
                  e.preventDefault();
                  commitSuggestion(sug);
                }}
                className={cn(
                  'system-b-pill-search-option flex h-auto w-full items-center justify-start gap-2 rounded-none text-left',
                  i === highlight
                    ? 'system-b-pill-search-option-highlighted text-primary-token'
                    : 'text-secondary-token'
                )}
              >
                <span
                  className={cn(
                    'system-b-pill-search-option-label inline-flex items-center',
                    i === highlight
                      ? 'system-b-pill-search-option-label-highlighted'
                      : 'system-b-pill-search-option-label-muted'
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
                  <kbd className='system-b-pill-search-kbd shrink-0'>↵</kbd>
                )}
              </Button>
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
    <span className='system-b-pill-search-chip inline-flex shrink-0 items-center overflow-hidden'>
      <span className='system-b-pill-search-chip-field'>
        {FIELD_LABEL[pill.field]}
      </span>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={onToggleOp}
        className='system-b-pill-search-chip-op h-auto'
        title='Toggle is / is not'
      >
        {pill.op}
      </Button>
      <span className='inline-flex min-w-0 items-center gap-0.5 pr-0.5'>
        {pill.values.map((v, i) => (
          <span key={v} className='inline-flex items-center'>
            {i > 0 && <span className='system-b-pill-search-chip-or'>or</span>}
            <span className='system-b-pill-search-chip-value inline-flex min-w-0 items-center'>
              <span className='truncate'>{v}</span>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                onClick={() => onRemoveValue(v)}
                className='system-b-pill-search-chip-value-remove h-auto w-auto'
                aria-label={`Remove ${v}`}
              >
                <X
                  aria-hidden='true'
                  className='system-b-pill-search-remove-icon'
                />
              </Button>
            </span>
          </span>
        ))}
      </span>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        onClick={onRemove}
        className='system-b-pill-search-chip-remove h-auto w-auto'
        aria-label='Remove Filter'
      >
        <X aria-hidden='true' className='system-b-pill-search-remove-icon' />
      </Button>
    </span>
  );
}
