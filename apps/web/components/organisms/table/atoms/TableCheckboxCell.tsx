'use client';

import { Checkbox } from '@jovie/ui';
import type { Row, Table } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';

/**
 * Checkbox state types
 */
export type CheckboxState = 'checked' | 'unchecked' | 'indeterminate' | boolean;

// Legacy props (backwards compatibility)
export interface TableCheckboxCellLegacyProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly rowNumber?: number; // Shows when unchecked/not hovered
  readonly ariaLabel: string;
  readonly isHeader?: boolean;
  readonly indeterminate?: boolean;
  readonly className?: string;
}

// TanStack Table props (recommended)
export interface TableCheckboxCellTanStackProps<TData = unknown> {
  readonly table?: Table<TData>;
  readonly row?: Row<TData>;
  readonly rowNumber?: number;
  readonly isChecked?: boolean;
  readonly onToggleSelect?: () => void;
  readonly headerCheckboxState?: CheckboxState;
  readonly onToggleSelectAll?: () => void;
}

export type TableCheckboxCellProps<TData = unknown> =
  | TableCheckboxCellLegacyProps
  | TableCheckboxCellTanStackProps<TData>;

function isLegacyProps<TData = unknown>(
  props: TableCheckboxCellProps<TData>
): props is TableCheckboxCellLegacyProps {
  return 'checked' in props && 'onChange' in props;
}

// Normalize header checkbox state to string format
function normalizeHeaderState(
  headerCheckboxState: 'checked' | 'unchecked' | 'indeterminate' | boolean
): 'checked' | 'unchecked' | 'indeterminate' {
  if (typeof headerCheckboxState === 'boolean') {
    return headerCheckboxState ? 'checked' : 'unchecked';
  }
  return headerCheckboxState;
}

// Header checkbox component for TanStack mode
function TanStackHeaderCheckbox({
  headerCheckboxState,
  onToggleSelectAll,
}: {
  headerCheckboxState: 'checked' | 'unchecked' | 'indeterminate' | boolean;
  onToggleSelectAll: () => void;
}) {
  const normalizedState = normalizeHeaderState(headerCheckboxState);

  return (
    <div
      className='relative flex h-5 w-5 items-center justify-center'
      onClick={event => event.stopPropagation()}
      onKeyDown={event =>
        handleActivationKeyDown(event, e => e.stopPropagation())
      }
    >
      <Checkbox
        aria-label='Select all rows'
        checked={
          normalizedState === 'indeterminate'
            ? 'indeterminate'
            : normalizedState === 'checked'
        }
        onCheckedChange={onToggleSelectAll}
      />
    </div>
  );
}

// Row checkbox component for TanStack mode
function TanStackRowCheckbox({
  rowNumber,
  isChecked,
  onToggleSelect,
}: {
  rowNumber?: number;
  isChecked: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <div
      className='relative flex h-5 w-5 items-center justify-center'
      onClick={event => event.stopPropagation()}
      onKeyDown={event =>
        handleActivationKeyDown(event, e => e.stopPropagation())
      }
    >
      <span
        className={cn(
          'select-none text-[13px] tabular-nums text-tertiary-token transition-opacity',
          isChecked ? 'opacity-0' : 'opacity-100 group-hover:opacity-0'
        )}
        aria-hidden='true'
      >
        {rowNumber}
      </span>
      <div
        className={cn(
          'absolute inset-0 transition-opacity flex items-center justify-center',
          isChecked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
      >
        <Checkbox
          aria-label={
            rowNumber === undefined ? 'Select row' : `Select row ${rowNumber}`
          }
          checked={isChecked}
          onCheckedChange={onToggleSelect}
        />
      </div>
    </div>
  );
}

// Legacy checkbox component
function LegacyCheckboxCell({
  checked,
  onChange,
  rowNumber,
  ariaLabel,
  isHeader = false,
  indeterminate = false,
  className,
}: TableCheckboxCellLegacyProps) {
  const Component = isHeader ? 'th' : 'td';

  return (
    <Component
      className={cn(
        'w-12 border-b border-subtle px-3 py-2 align-middle text-center',
        isHeader && 'sticky z-20 bg-surface-1',
        !isHeader && 'group-hover:bg-transparent',
        className
      )}
    >
      <div className='relative flex items-center justify-center'>
        {!isHeader && rowNumber !== undefined && (
          <span
            className={cn(
              'absolute inset-0 flex items-center justify-center text-[13px] tabular-nums text-tertiary-token transition-opacity',
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
            checked={checked ? true : indeterminate ? 'indeterminate' : false}
            onCheckedChange={(value: boolean | 'indeterminate') =>
              onChange(value === true)
            }
            aria-label={ariaLabel}
          />
        </div>
      </div>
    </Component>
  );
}

/**
 * Unified table checkbox cell with row number toggle on hover.
 *
 * Supports two modes:
 * 1. Legacy mode: Simple checked/onChange interface
 * 2. TanStack Table mode: Integration with TanStack Table row selection
 *
 * @example
 * // TanStack Table mode (recommended)
 * columnHelper.display({
 *   id: 'select',
 *   header: ({ table }) => (
 *     <TableCheckboxCell
 *       table={table}
 *       headerCheckboxState={headerCheckboxState}
 *       onToggleSelectAll={toggleSelectAll}
 *     />
 *   ),
 *   cell: ({ row }) => (
 *     <TableCheckboxCell
 *       row={row}
 *       rowNumber={row.index + 1}
 *       isChecked={selectedIds.has(row.original.id)}
 *       onToggleSelect={() => toggleSelect(row.original.id)}
 *     />
 *   ),
 * })
 */
export function TableCheckboxCell<TData = unknown>(
  props: TableCheckboxCellProps<TData>
) {
  // Legacy mode
  if (isLegacyProps(props)) {
    return <LegacyCheckboxCell {...props} />;
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
    return (
      <TanStackHeaderCheckbox
        headerCheckboxState={headerCheckboxState}
        onToggleSelectAll={onToggleSelectAll}
      />
    );
  }

  // Row cell
  if (row && typeof isChecked === 'boolean' && onToggleSelect) {
    return (
      <TanStackRowCheckbox
        rowNumber={rowNumber}
        isChecked={isChecked}
        onToggleSelect={onToggleSelect}
      />
    );
  }

  // Fallback
  return null;
}
