'use client';

import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TableCountBadge } from '../atoms/TableCountBadge';

export interface BulkAction {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly variant?: 'default' | 'destructive';
}

export interface TableStandardToolbarProps {
  /** Number of selected items */
  readonly selectedCount?: number;
  /** Total number of items */
  readonly totalCount: number;
  /** Checkbox state for select all */
  readonly headerCheckboxState?: boolean | 'indeterminate';
  /** Callback when select all checkbox is toggled */
  readonly onToggleSelectAll?: () => void;
  /** Callback to clear selection */
  readonly onClearSelection?: () => void;
  /** Array of bulk actions shown in dropdown when items selected */
  readonly bulkActions?: BulkAction[];
  /** Search component to render on the right side */
  readonly searchComponent?: ReactNode;
  /** Export component to render on the right side */
  readonly exportComponent?: ReactNode;
  /** Additional actions shown when no items selected */
  readonly primaryActions?: ReactNode;
  /** Additional CSS classes */
  readonly className?: string;
}

/**
 * Unified standard toolbar for all tables.
 *
 * Provides a consistent pattern with:
 * - Left: Select all checkbox + count badge
 * - Center: Bulk actions dropdown (when items selected)
 * - Right: Search, export, and primary actions
 *
 * @example
 * <TableStandardToolbar
 *   selectedCount={selectedIds.size}
 *   totalCount={data.length}
 *   headerCheckboxState={headerCheckboxState}
 *   onToggleSelectAll={toggleSelectAll}
 *   onClearSelection={clearSelection}
 *   bulkActions={[
 *     { label: 'Delete', onClick: handleDelete, variant: 'destructive' },
 *     { label: 'Export', onClick: handleExport },
 *   ]}
 *   searchComponent={<TableSearchBar value={search} onChange={setSearch} />}
 *   exportComponent={<ExportCSVButton {...exportProps} />}
 * />
 */
export function TableStandardToolbar({
  selectedCount = 0,
  totalCount,
  headerCheckboxState,
  onToggleSelectAll,
  onClearSelection,
  bulkActions = [],
  searchComponent,
  exportComponent,
  primaryActions,
  className,
}: TableStandardToolbarProps) {
  const hasSelection = selectedCount > 0;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-subtle bg-surface-1 px-4 py-2.5',
        className
      )}
    >
      {/* Left section: Checkbox + count badge + bulk actions */}
      <div className='flex items-center gap-3'>
        {onToggleSelectAll && (
          <Checkbox
            checked={headerCheckboxState}
            onCheckedChange={() => onToggleSelectAll()}
            aria-label='Select all rows'
          />
        )}

        <TableCountBadge
          selectedCount={selectedCount}
          totalCount={totalCount}
        />

        {/* Bulk actions dropdown - shown when items selected */}
        {hasSelection && bulkActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='secondary' size='sm'>
                Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start'>
              {bulkActions.map(action => (
                <DropdownMenuItem
                  key={action.label}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={cn(
                    'flex items-center gap-2',
                    action.variant === 'destructive' &&
                      'text-destructive focus:text-destructive'
                  )}
                >
                  {action.icon && (
                    <span className='h-4 w-4'>{action.icon}</span>
                  )}
                  <span>{action.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Right section: Search, export, primary actions, clear */}
      <div className='flex items-center gap-3'>
        {/* Search - shown when no selection */}
        {!hasSelection && searchComponent}

        {/* Export - shown when no selection */}
        {!hasSelection && exportComponent}

        {/* Primary actions - shown when no selection */}
        {!hasSelection && primaryActions}

        {/* Clear selection button - shown when items selected */}
        {hasSelection && onClearSelection && (
          <Button
            variant='ghost'
            size='sm'
            onClick={onClearSelection}
            className='gap-1'
          >
            <X className='h-4 w-4' />
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
