'use client';

import { Checkbox } from '@jovie/ui';
import type { Row, Table } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';

// Legacy props (backwards compatibility)
export interface TableCheckboxCellLegacyProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  rowNumber?: number; // Shows when unchecked/not hovered
  ariaLabel: string;
  isHeader?: boolean;
  indeterminate?: boolean;
  className?: string;
}

// New TanStack Table props
export interface TableCheckboxCellTanStackProps<TData = unknown> {
  table?: Table<TData>;
  row?: Row<TData>;
  rowNumber?: number;
  isChecked?: boolean;
  onToggleSelect?: () => void;
  headerCheckboxState?: 'checked' | 'unchecked' | 'indeterminate' | boolean;
  onToggleSelectAll?: () => void;
}

export type TableCheckboxCellProps<TData = unknown> =
  | TableCheckboxCellLegacyProps
  | TableCheckboxCellTanStackProps<TData>;

function isLegacyProps<TData = unknown>(
  props: TableCheckboxCellProps<TData>
): props is TableCheckboxCellLegacyProps {
  return 'checked' in props && 'onChange' in props;
}

export function TableCheckboxCell<TData = unknown>(
  props: TableCheckboxCellProps<TData>
) {
  // Legacy mode
  if (isLegacyProps(props)) {
    const {
      checked,
      onChange,
      rowNumber,
      ariaLabel,
      isHeader = false,
      indeterminate = false,
      className,
    } = props;

    const Component = isHeader ? 'th' : 'td';

    return (
      <Component
        className={cn(
          'px-4 py-3 border-b border-subtle w-14 text-center',
          isHeader && 'sticky z-20 bg-surface-1/80 backdrop-blur',
          !isHeader && 'group-hover:bg-transparent',
          className
        )}
      >
        <div className='relative flex items-center justify-center'>
          {!isHeader && rowNumber !== undefined && (
            <span
              className={cn(
                'absolute inset-0 flex items-center justify-center text-[11px] tabular-nums text-tertiary-token transition-opacity',
                checked ? 'opacity-0' : 'group-hover:opacity-0'
              )}
            >
              {rowNumber}
            </span>
          )}
          <div
            className={cn(
              'transition-opacity',
              !isHeader && !checked && 'opacity-0 group-hover:opacity-100'
            )}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(value: boolean | 'indeterminate') =>
                onChange(value === true)
              }
              aria-label={ariaLabel}
              indeterminate={indeterminate}
            />
          </div>
        </div>
      </Component>
    );
  }

  // TanStack Table mode
  const {
    table,
    row,
    rowNumber,
    isChecked,
    onToggleSelect,
    headerCheckboxState,
    onToggleSelectAll,
  } = props;

  // Header cell
  if (table && headerCheckboxState !== undefined && onToggleSelectAll) {
    // Convert boolean to 'checked'/'unchecked' format
    const normalizedState =
      typeof headerCheckboxState === 'boolean'
        ? headerCheckboxState
          ? 'checked'
          : 'unchecked'
        : headerCheckboxState;

    return (
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Custom interactive checkbox container
      // biome-ignore lint/a11y/noStaticElementInteractions: Click handler stops propagation only
      <div
        className='relative flex h-5 w-5 items-center justify-center'
        onClick={event => event.stopPropagation()}
        onKeyDown={event =>
          handleActivationKeyDown(event, e => e.stopPropagation())
        }
      >
        <Checkbox
          aria-label='Select all rows'
          checked={normalizedState === 'checked'}
          indeterminate={normalizedState === 'indeterminate'}
          onCheckedChange={onToggleSelectAll}
          className='border-2 border-tertiary-token/50 data-[state=checked]:border-primary/70 data-[state=checked]:bg-primary/70 data-[state=checked]:text-primary-foreground'
        />
      </div>
    );
  }

  // Row cell
  if (row && typeof isChecked === 'boolean' && onToggleSelect) {
    return (
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Custom interactive checkbox container
      // biome-ignore lint/a11y/noStaticElementInteractions: Click handler stops propagation only
      <div
        className='relative flex h-5 w-5 items-center justify-center'
        onClick={event => event.stopPropagation()}
        onKeyDown={event =>
          handleActivationKeyDown(event, e => e.stopPropagation())
        }
      >
        <span
          className={cn(
            'text-[11px] tabular-nums text-tertiary-token select-none transition-opacity',
            isChecked ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
          )}
          aria-hidden='true'
        >
          {rowNumber}
        </span>
        <div
          className={cn(
            'absolute inset-0 transition-opacity',
            isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <Checkbox
            aria-label={`Select row ${rowNumber}`}
            checked={isChecked}
            onCheckedChange={onToggleSelect}
            className='border-2 border-tertiary-token/50 data-[state=checked]:border-primary/70 data-[state=checked]:bg-primary/70 data-[state=checked]:text-primary-foreground'
          />
        </div>
      </div>
    );
  }

  // Fallback
  return null;
}
