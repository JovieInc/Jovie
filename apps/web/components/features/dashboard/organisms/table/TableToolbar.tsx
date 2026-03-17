import { Checkbox } from '@jovie/ui';
import type { ReactNode } from 'react';
import { TableCountBadge } from '@/components/organisms/table';
import { cn } from '@/lib/utils';

export interface TableToolbarProps {
  /** Number of selected rows */
  readonly selectedCount?: number;
  /** Total number of rows */
  readonly totalCount: number;
  /** Callback to select all rows */
  readonly onSelectAll?: () => void;
  /** Callback to deselect all rows */
  readonly onDeselectAll?: () => void;
  /** Bulk actions shown when items are selected */
  readonly bulkActions?: ReactNode;
  /** Primary actions shown when no items are selected */
  readonly actions?: ReactNode;
  /** Additional CSS classes */
  readonly className?: string;
}

/**
 * TableToolbar - Standard toolbar for all tables
 *
 * Matches DashboardAudienceTable pattern with:
 * - Left: Selection checkbox + count badge
 * - Center: Bulk actions (shown when items selected)
 * - Right: Primary actions (shown when no selection)
 *
 * Can be used with sticky positioning by adding 'sticky top-0 z-20' via className
 */
function getSelectionState(
  selectedCount: number,
  totalCount: number
): boolean | 'indeterminate' {
  if (selectedCount === 0) return false;
  if (selectedCount === totalCount) return true;
  return 'indeterminate';
}

export function TableToolbar({
  selectedCount = 0,
  totalCount,
  onSelectAll,
  onDeselectAll,
  bulkActions,
  actions,
  className,
}: TableToolbarProps) {
  const hasSelection = selectedCount > 0;

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-subtle bg-surface-0 px-4 py-2.5',
        className
      )}
    >
      {/* Left: Selection checkbox + count badge */}
      <div className='flex items-center gap-2'>
        {onSelectAll && onDeselectAll && (
          <Checkbox
            checked={getSelectionState(selectedCount, totalCount)}
            onCheckedChange={checked => {
              checked ? onSelectAll() : onDeselectAll();
            }}
            aria-label='Select all rows'
          />
        )}

        <div className='flex items-center gap-1.5'>
          <TableCountBadge
            selectedCount={selectedCount}
            totalCount={totalCount}
          />
        </div>
      </div>

      {/* Center: Bulk actions (shown when items selected) */}
      {hasSelection && bulkActions && (
        <div className='flex items-center gap-2'>{bulkActions}</div>
      )}

      {/* Right: Primary actions */}
      {!hasSelection && actions && (
        <div className='flex items-center gap-2'>{actions}</div>
      )}
    </div>
  );
}
