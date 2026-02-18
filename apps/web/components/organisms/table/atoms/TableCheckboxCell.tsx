'use client';

import { Checkbox } from '@jovie/ui';
import type { Row, Table } from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { handleActivationKeyDown } from '@/lib/utils/keyboard';

/**
 * Checkbox state types
 */
export type CheckboxState = 'checked' | 'unchecked' | 'indeterminate' | boolean;

// Shared checkbox styling for consistent appearance (uses design tokens)
const CHECKBOX_STYLES =
  'h-4 w-4 border-2 border-subtle rounded-[4px] data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-white data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-white';

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
    // role="presentation" correctly hides wrapper from screen readers; Checkbox inside is the interactive element
    <div
      className='relative flex h-5 w-5 items-center justify-center'
      onClick={event => event.stopPropagation()}
      onKeyDown={event =>
        handleActivationKeyDown(event, e => e.stopPropagation())
      }
      role='presentation'
    >
      <Checkbox
        aria-label='Select all rows'
        checked={normalizedState === 'checked'}
        indeterminate={normalizedState === 'indeterminate'}
        onCheckedChange={onToggleSelectAll}
        className={CHECKBOX_STYLES}
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
    // role="presentation" correctly hides wrapper from screen readers; Checkbox inside is the interactive element
    <div
      className='relative flex h-5 w-5 items-center justify-center'
      onClick={event => event.stopPropagation()}
      onKeyDown={event =>
        handleActivationKeyDown(event, e => e.stopPropagation())
      }
      role='presentation'
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
          aria-label={
            rowNumber === undefined ? 'Select row' : `Select row ${rowNumber}`
          }
          checked={isChecked}
          onCheckedChange={onToggleSelect}
          className={CHECKBOX_STYLES}
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
