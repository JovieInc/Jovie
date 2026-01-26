'use client';

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TooltipShortcut,
} from '@jovie/ui';
import { memo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ExportCSVButton } from '@/components/organisms/table';
import type { ReleaseType, ReleaseViewModel } from '@/lib/discography/types';
import { cn } from '@/lib/utils';
import { useReleaseFilterCounts } from './hooks/useReleaseFilterCounts';
import { ReleaseFilterDropdown } from './ReleaseFilterDropdown';
import {
  getReleasesForExport,
  RELEASES_CSV_COLUMNS,
} from './utils/exportReleases';

/** Filter state for releases table */
export interface ReleaseFilters {
  releaseTypes: ReleaseType[];
  availability: 'all' | 'complete' | 'incomplete';
}

/** Default filter state */
export const DEFAULT_RELEASE_FILTERS: ReleaseFilters = {
  releaseTypes: [],
  availability: 'all',
};

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
  /** Callback to reset display settings to defaults */
  onResetToDefaults?: () => void;
  /** Current filter state */
  filters: ReleaseFilters;
  /** Callback when filters change */
  onFiltersChange: (filters: ReleaseFilters) => void;
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
  onResetToDefaults,
}: {
  columnVisibility: Record<string, boolean>;
  onColumnVisibilityChange: (columnId: string, visible: boolean) => void;
  availableColumns: readonly { id: string; label: string }[];
  onResetToDefaults?: () => void;
}) {
  return (
    <Popover>
      <TooltipShortcut label='Display' shortcut='⇧V' side='bottom'>
        <PopoverTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className='h-7 gap-1.5 text-secondary-token hover:bg-surface-2 hover:text-primary-token'
          >
            <Icon name='SlidersHorizontal' className='h-3.5 w-3.5' />
            Display
          </Button>
        </PopoverTrigger>
      </TooltipShortcut>
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
                  aria-pressed={isVisible}
                  aria-label={`${isVisible ? 'Hide' : 'Show'} ${col.label} column`}
                  className={cn(
                    'rounded px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
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
        {onResetToDefaults && (
          <div className='border-t border-subtle px-2.5 py-2'>
            <button
              type='button'
              onClick={onResetToDefaults}
              className='text-[11px] text-tertiary-token hover:text-secondary-token transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1'
            >
              Reset to defaults
            </button>
          </div>
        )}
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
  onResetToDefaults,
  filters,
  onFiltersChange,
}: ReleaseTableSubheaderProps) {
  // Compute filter counts for displaying badges
  const counts = useReleaseFilterCounts(releases);

  return (
    <div className='flex items-center justify-between border-b border-subtle bg-base px-4 py-1.5'>
      {/* Left: Filter dropdown */}
      <ReleaseFilterDropdown
        filters={filters}
        onFiltersChange={onFiltersChange}
        counts={counts}
      />

      {/* Right: Display + Export */}
      <div className='flex items-center gap-2'>
        <LinearStyleDisplayMenu
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={onColumnVisibilityChange}
          availableColumns={availableColumns}
          onResetToDefaults={onResetToDefaults}
        />
        <ExportCSVButton
          getData={() => getReleasesForExport(releases, selectedIds)}
          columns={RELEASES_CSV_COLUMNS}
          filename='releases'
          label={selectedIds.size > 0 ? `Export ${selectedIds.size}` : 'Export'}
          variant='ghost'
          size='sm'
          className='h-7 gap-1.5 text-secondary-token hover:bg-surface-2/50 hover:text-primary-token'
        />
      </div>
    </div>
  );
});
