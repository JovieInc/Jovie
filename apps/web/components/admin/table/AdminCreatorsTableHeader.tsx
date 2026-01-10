'use client';

import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import {
  getSortDirection,
  SORTABLE_COLUMNS,
  SortableColumnKey,
} from '@/components/admin/creator-sort-config';
import { SortableHeaderButton } from '@/components/admin/table/SortableHeaderButton';
import type { AdminCreatorProfilesSort } from '@/lib/admin/creator-profiles';
import { cn } from '@/lib/utils';

export interface AdminCreatorsTableHeaderProps {
  sort: AdminCreatorProfilesSort;
  headerCheckboxState: boolean | 'indeterminate';
  selectedCount: number;
  headerElevated: boolean;
  stickyTopPx: number;
  onToggleSelectAll: () => void;
  onSortChange: (column: SortableColumnKey) => void;
}

export function AdminCreatorsTableHeader({
  sort,
  headerCheckboxState,
  selectedCount,
  headerElevated,
  stickyTopPx,
  onToggleSelectAll,
  onSortChange,
}: AdminCreatorsTableHeaderProps) {
  const headerCellClass = cn(
    'sticky z-20 px-4 py-3 text-left border-b border-subtle bg-surface-1/80 backdrop-blur supports-backdrop-filter:bg-surface-1/70',
    headerElevated && 'shadow-sm shadow-black/10 dark:shadow-black/40'
  );

  return (
    <thead className='text-left text-secondary-token'>
      <tr className='text-xs uppercase tracking-wide text-tertiary-token'>
        <th
          className={cn(headerCellClass, 'w-14')}
          style={{ top: stickyTopPx }}
        >
          <Checkbox
            aria-label='Select all creators'
            checked={headerCheckboxState}
            onCheckedChange={onToggleSelectAll}
            className='border-sidebar-border data-[state=checked]:bg-sidebar-accent data-[state=checked]:text-sidebar-accent-foreground'
          />
        </th>
        <th className={headerCellClass} style={{ top: stickyTopPx }}>
          <span className='sr-only'>Creator</span>
          <div className='inline-flex items-center h-8'>
            <div
              className={cn(
                'transition-all duration-150',
                selectedCount > 0
                  ? 'opacity-100 translate-y-0'
                  : 'pointer-events-none opacity-0 -translate-y-0.5'
              )}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant='secondary' size='sm' className='normal-case'>
                    Bulk actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='start'>
                  <DropdownMenuItem disabled>
                    Feature selected (coming soon)
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    Unverify selected (coming soon)
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled className='text-destructive'>
                    Delete selected (coming soon)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </th>
        <th
          className={cn(
            headerCellClass,
            'cursor-pointer select-none hidden md:table-cell'
          )}
          style={{ top: stickyTopPx }}
        >
          <SortableHeaderButton
            label={SORTABLE_COLUMNS.created.label}
            direction={getSortDirection(sort, 'created')}
            onClick={() => onSortChange('created')}
          />
        </th>
        <th
          className={cn(
            headerCellClass,
            'cursor-pointer select-none hidden md:table-cell'
          )}
          style={{ top: stickyTopPx }}
        >
          <SortableHeaderButton
            label={SORTABLE_COLUMNS.claimed.label}
            direction={getSortDirection(sort, 'claimed')}
            onClick={() => onSortChange('claimed')}
          />
        </th>
        <th
          className={cn(headerCellClass, 'cursor-pointer select-none')}
          style={{ top: stickyTopPx }}
        >
          <SortableHeaderButton
            label={SORTABLE_COLUMNS.verified.label}
            direction={getSortDirection(sort, 'verified')}
            onClick={() => onSortChange('verified')}
          />
        </th>
        <th
          className={cn(headerCellClass, 'text-right')}
          style={{ top: stickyTopPx }}
        >
          <span className='sr-only'>Action</span>
          <div className='flex items-center justify-end' />
        </th>
      </tr>
    </thead>
  );
}
