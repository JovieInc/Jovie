'use client';

import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { useMemo } from 'react';
import {
  getSortDirection,
  SORTABLE_COLUMNS,
  SortableColumnKey,
} from '@/components/admin/creator-sort-config';
import { SortableHeaderButton } from '@/components/organisms/table/SortableHeaderButton';
import type { AdminCreatorProfilesSort } from '@/lib/admin/creator-profiles';
import { cn } from '@/lib/utils';

export interface AdminCreatorsTableHeaderProps {
  readonly sort: AdminCreatorProfilesSort;
  readonly headerCheckboxState: boolean | 'indeterminate';
  readonly selectedCount: number;
  readonly headerElevated: boolean;
  readonly stickyTopPx: number;
  readonly onToggleSelectAll: () => void;
  readonly onSortChange: (column: SortableColumnKey) => void;
  /**
   * Optional header actions (e.g., ingest profile button, drawer toggle).
   * If provided, these will be displayed in the Actions column header.
   */
  readonly headerActions?: React.ReactNode;
}

export function AdminCreatorsTableHeader({
  sort,
  headerCheckboxState,
  selectedCount,
  headerElevated,
  stickyTopPx,
  onToggleSelectAll,
  onSortChange,
  headerActions,
}: Readonly<AdminCreatorsTableHeaderProps>) {
  const headerCellClass = cn(
    'sticky z-20 border-b border-(--linear-border-subtle) bg-(--linear-app-content-surface) px-4 py-2 text-left',
    headerElevated && 'shadow-sm shadow-black/10 dark:shadow-black/40'
  );

  const stickyStyle = useMemo<React.CSSProperties>(
    () => ({ top: stickyTopPx }),
    [stickyTopPx]
  );

  return (
    <thead className='text-left text-(--linear-text-secondary)'>
      <tr className='text-[11px] font-[510] uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
        <th className={cn(headerCellClass, 'w-14')} style={stickyStyle}>
          <Checkbox
            aria-label='Select all creators'
            checked={headerCheckboxState}
            onCheckedChange={onToggleSelectAll}
            className='border-(--linear-border-subtle) bg-(--linear-bg-surface-0) text-(--linear-accent) data-[state=checked]:border-(--linear-accent) data-[state=checked]:bg-(--linear-accent) data-[state=checked]:text-white'
          />
        </th>
        <th className={headerCellClass} style={stickyStyle}>
          <div className='inline-flex h-8 items-center'>
            {selectedCount > 0 ? (
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
            ) : (
              <span className='text-[11px] font-[510] uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
                Creator
              </span>
            )}
          </div>
        </th>
        <th
          className={cn(headerCellClass, 'hidden lg:table-cell')}
          style={stickyStyle}
        >
          <span className='text-[11px] font-[510] uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
            Social
          </span>
        </th>
        <th
          className={cn(
            headerCellClass,
            'cursor-pointer select-none hidden md:table-cell'
          )}
          style={stickyStyle}
        >
          <SortableHeaderButton
            label={SORTABLE_COLUMNS.created.label}
            direction={getSortDirection(sort, 'created')}
            onClick={() => onSortChange('created')}
          />
        </th>
        <th className={cn(headerCellClass, 'text-right')} style={stickyStyle}>
          {headerActions ? (
            <div className='flex items-center justify-end'>{headerActions}</div>
          ) : (
            <span className='text-[11px] font-[510] uppercase tracking-[0.08em] text-(--linear-text-tertiary)'>
              Actions
            </span>
          )}
        </th>
      </tr>
    </thead>
  );
}
