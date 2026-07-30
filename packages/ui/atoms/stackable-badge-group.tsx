'use client';

import * as React from 'react';
import { cn } from '../lib/utils';
import { badgeVariants } from './badge';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export type StackableBadgeTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'accent'
  | 'warning'
  | 'error';

/** One stable entry in a compact stack. Input order is display order. */
export interface StackableBadgeItem {
  /** Stable identity. Labels and icons may repeat. */
  readonly id: string;
  /** Exposed in the primary badge and the full-list disclosure. */
  readonly label: string;
  /** Optional brand or semantic mark. Lower stack entries render icon-only. */
  readonly icon?: React.ReactNode;
  readonly tone?: StackableBadgeTone;
  readonly selected?: boolean;
  readonly disabled?: boolean;
}

export interface StackableBadgeGroupProps
  extends Omit<React.FieldsetHTMLAttributes<HTMLFieldSetElement>, 'children'> {
  readonly items: readonly StackableBadgeItem[];
  /** Includes the labelled primary item. A minimum of one remains visible. */
  readonly maxVisible?: number;
  /** Compact table geometry is the default; standard uses the same fixed slot. */
  readonly density?: 'dense' | 'standard';
  /**
   * Fixed inline slot selected by the consumer. Compact is table-first; every
   * item count uses the same slot so adjacent columns never move.
   */
  readonly width?: 'compact' | 'standard';
  /** Override the list announcement when the item labels alone are insufficient. */
  readonly ariaLabel?: string;
}

const visibleCap = (maxVisible: number) => Math.max(1, maxVisible);

const itemClasses = (item: StackableBadgeItem) =>
  cn(
    badgeVariants({ size: 'sm', tone: item.tone ?? 'neutral' }),
    'h-5 shrink-0 justify-center border-2 border-surface-0 transition-colors duration-fast ease-interactive',
    item.selected && 'ring-1 ring-accent/40',
    item.disabled && 'opacity-50',
    'group-hover/badge-stack:bg-surface-2 group-focus-within/badge-stack:bg-surface-2'
  );

/**
 * Compact, fixed-width badge stack for dense table cells and metadata rows.
 *
 * The first item carries its label. Remaining visible entries show only their
 * icons and overlap at the logical inline-start edge. Overflow is always an
 * accessible Radix disclosure containing the complete, input-ordered list.
 * The consumer selects a fixed compact or standard slot; changes in item count
 * never move adjacent table columns.
 */
export function StackableBadgeGroup({
  items,
  maxVisible = 3,
  density = 'dense',
  width = 'compact',
  ariaLabel,
  className,
  ...props
}: StackableBadgeGroupProps) {
  if (items.length === 0) return null;

  const visible = items.slice(0, visibleCap(maxVisible));
  const overflowCount = Math.max(0, items.length - visible.length);
  const primary = visible[0];
  const groupLabel = ariaLabel ?? items.map(item => item.label).join(', ');

  return (
    <fieldset
      aria-label={groupLabel}
      className={cn(
        'group/badge-stack m-0 inline-flex h-5 max-w-full items-center overflow-hidden border-0 p-0',
        width === 'compact' ? 'w-32' : 'w-40',
        density === 'standard' && 'h-6',
        className
      )}
      data-slot='stackable-badge-group'
      {...props}
    >
      <span
        className={cn(
          itemClasses(primary),
          'min-w-0 max-w-32 flex-1 gap-1 px-1.5',
          density === 'standard' && 'h-6'
        )}
        title={primary.label}
      >
        {primary.icon && (
          <span aria-hidden='true' className='grid shrink-0 place-items-center'>
            {primary.icon}
          </span>
        )}
        <span className='min-w-0 truncate'>{primary.label}</span>
      </span>

      <span aria-hidden='true' className='flex shrink-0 items-center'>
        {visible.slice(1).map(item => (
          <span
            key={item.id}
            className={cn(
              itemClasses(item),
              '-ms-1.5 w-5 p-0',
              density === 'standard' && 'h-6 w-6'
            )}
            title={item.label}
          >
            <span className='grid shrink-0 place-items-center'>
              {item.icon ?? (
                <span className='h-1.5 w-1.5 rounded-full bg-current' />
              )}
            </span>
          </span>
        ))}
      </span>

      {overflowCount > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              aria-label={`Show ${overflowCount} more badges`}
              className={cn(
                'ms-1 h-5 shrink-0 px-1.5 text-3xs font-medium tabular-nums',
                density === 'standard' && 'h-6'
              )}
              size='sm'
              variant='ghost'
            >
              +{overflowCount} more
            </Button>
          </PopoverTrigger>
          <PopoverContent align='end' className='w-56 p-1' side='bottom'>
            <ul aria-label='All badges' className='grid gap-0.5'>
              {items.map(item => (
                <li
                  key={item.id}
                  className={cn(
                    'flex min-h-8 items-center gap-2 rounded-lg px-2 text-xs text-secondary-token',
                    item.selected && 'bg-surface-1 text-primary-token',
                    item.disabled && 'opacity-50'
                  )}
                >
                  <span
                    aria-hidden='true'
                    className={cn(itemClasses(item), 'h-4 w-4 p-0 text-3xs')}
                  >
                    {item.icon ?? (
                      <span className='h-1.5 w-1.5 rounded-full bg-current' />
                    )}
                  </span>
                  <span className='min-w-0 truncate'>{item.label}</span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </fieldset>
  );
}
