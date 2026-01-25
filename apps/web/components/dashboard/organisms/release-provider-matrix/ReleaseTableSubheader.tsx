'use client';

import { Button, Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { memo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ExportCSVButton } from '@/components/organisms/table';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import {
  getReleasesForExport,
  RELEASES_CSV_COLUMNS,
} from './utils/exportReleases';

interface ReleaseTableSubheaderProps {
  /** All releases for export */
  releases: ReleaseViewModel[];
  /** Selected release IDs for filtered export */
  selectedIds: Set<string>;
  /** Column visibility state */
  columnVisibility: Record<string, boolean>;
  /** Callback when column visibility changes */
  onColumnVisibilityChange: (columnId: string, visible: boolean) => void;
  /** Available columns to toggle */
  availableColumns: readonly { id: string; label: string }[];
  /** Active filter count for badge (0 = no filters) */
  activeFilterCount?: number;
}

/**
 * LinearStyleDisplayMenu - Compact display settings popover
 *
 * Features:
 * - Display properties as pill toggles (tightened spacing)
 */
function LinearStyleDisplayMenu({
  columnVisibility,
  onColumnVisibilityChange,
  availableColumns,
}: {
  columnVisibility: Record<string, boolean>;
  onColumnVisibilityChange: (columnId: string, visible: boolean) => void;
  availableColumns: readonly { id: string; label: string }[];
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          className='h-7 gap-1.5 text-secondary-token'
        >
          <Icon name='SlidersHorizontal' className='h-3.5 w-3.5' />
          Display
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-56 p-0'>
        <div className='p-2.5'>
          <p className='mb-1.5 text-[11px] font-medium text-tertiary-token'>
            Display properties
          </p>
          <div className='flex flex-wrap gap-1'>
            {availableColumns.map(col => {
              const isVisible = columnVisibility[col.id] !== false;
              return (
                <button
                  key={col.id}
                  type='button'
                  onClick={() => onColumnVisibilityChange(col.id, !isVisible)}
                  className={cn(
                    'rounded px-2 py-0.5 text-[11px] font-medium transition-colors',
                    isVisible
                      ? 'bg-surface-2 text-primary-token'
                      : 'text-tertiary-token hover:bg-surface-2/50'
                  )}
                >
                  {col.label}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * ReleaseTableSubheader - Subheader with Filter, Display, and Export controls
 *
 * Follows Linear's UI pattern with:
 * - Filter button on the left
 * - Display settings + Export button on the right
 */
export const ReleaseTableSubheader = memo(function ReleaseTableSubheader({
  releases,
  selectedIds,
  columnVisibility,
  onColumnVisibilityChange,
  availableColumns,
  activeFilterCount = 0,
}: ReleaseTableSubheaderProps) {
  return (
    <div className='flex items-center justify-between border-b border-subtle bg-base px-4 py-1.5'>
      {/* Left: Filter button */}
      <Button
        variant='ghost'
        size='sm'
        className='h-7 gap-1.5 text-secondary-token'
      >
        <Icon name='Filter' className='h-3.5 w-3.5' />
        Filter
        {activeFilterCount > 0 && (
          <span className='ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-white'>
            {activeFilterCount}
          </span>
        )}
      </Button>

      {/* Right: Display + Export */}
      <div className='flex items-center gap-2'>
        <LinearStyleDisplayMenu
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={onColumnVisibilityChange}
          availableColumns={availableColumns}
        />
        <ExportCSVButton
          getData={() => getReleasesForExport(releases, selectedIds)}
          columns={RELEASES_CSV_COLUMNS}
          filename='releases'
          label={selectedIds.size > 0 ? `Export ${selectedIds.size}` : 'Export'}
          variant='ghost'
          size='sm'
        />
      </div>
    </div>
  );
});
