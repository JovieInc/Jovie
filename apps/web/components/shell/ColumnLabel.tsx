'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc';

export interface ColumnLabelProps<F extends string> {
  /** Field key this column represents. Forwarded to onSort. */
  readonly field: F;
  readonly label: string;
  /** Tailwind width class (e.g. `'w-24'`) when the column has a fixed width. */
  readonly width?: string;
  /** When true, the column expands to fill remaining space. Use on at most one column. */
  readonly flex?: boolean;
  readonly align: 'left' | 'right';
  /** The currently sorted field. Used to highlight the active column. */
  readonly sortBy: F;
  readonly sortDir: SortDirection;
  readonly onSort: (field: F) => void;
  /**
   * Field that represents the natural / default ordering. The sort
   * indicator stays muted on this field even when it's `sortBy`, so
   * default-ordered tables don't paint a column as user-chosen.
   * Defaults to none.
   */
  readonly defaultField?: F;
  readonly className?: string;
}

/**
 * ColumnLabel — sort-aware table header. Click cycles sort direction
 * (callers track `sortBy` / `sortDir` and update them in `onSort`).
 * The arrow stays hidden until hover, then dims in; the active column
 * brightens to cyan and shows the explicit asc/desc arrow.
 *
 * Generic over the field union so each table keeps its own closed enum
 * of sortable columns at the call site:
 *
 * ```tsx
 * type ReleaseSortField = 'title' | 'artist' | 'releaseDate' | 'index';
 *
 * <ColumnLabel<ReleaseSortField>
 *   field='title'
 *   label='Title'
 *   align='left'
 *   flex
 *   sortBy={sortBy}
 *   sortDir={sortDir}
 *   onSort={setSortBy}
 *   defaultField='index'
 * />
 * ```
 */
export function ColumnLabel<F extends string>({
  field,
  label,
  width,
  flex,
  align,
  sortBy,
  sortDir,
  onSort,
  defaultField,
  className,
}: ColumnLabelProps<F>) {
  const active = sortBy === field && field !== defaultField;
  return (
    <button
      type='button'
      onClick={() => onSort(field)}
      className={cn(
        'group/col h-6 px-1 -mx-1 rounded-md text-[9.5px] uppercase tracking-[0.12em] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token transition-colors duration-150 ease-out',
        flex ? 'flex-1 min-w-0' : (width ?? ''),
        'shrink-0 inline-flex items-center gap-1',
        align === 'right' && 'flex-row-reverse',
        active
          ? 'text-cyan-300/90'
          : 'text-quaternary-token/85 hover:text-secondary-token',
        className
      )}
    >
      <span>{label}</span>
      <span
        aria-hidden='true'
        className={cn(
          'inline-flex items-center transition-opacity duration-150 ease-out',
          active ? 'opacity-100' : 'opacity-0 group-hover/col:opacity-60'
        )}
      >
        {active ? (
          sortDir === 'asc' ? (
            <ArrowUp className='h-2.5 w-2.5' strokeWidth={2.5} />
          ) : (
            <ArrowDown className='h-2.5 w-2.5' strokeWidth={2.5} />
          )
        ) : (
          <ArrowUpDown className='h-2.5 w-2.5' strokeWidth={2.25} />
        )}
      </span>
    </button>
  );
}
