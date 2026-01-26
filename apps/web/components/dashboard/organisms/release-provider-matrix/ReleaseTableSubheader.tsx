'use client';

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from '@jovie/ui';
import { memo } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { ExportCSVButton } from '@/components/organisms/table';
import type { Density } from '@/components/organisms/table/molecules/DisplayMenuDropdown';
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
  /** Current density setting */
  density: Density;
  /** Callback when density changes */
  onDensityChange: (density: Density) => void;
  /** Active filter count for badge (0 = no filters) */
  activeFilterCount?: number;
}

/** Grouping options for the display menu */
const GROUPING_OPTIONS = [
  { value: 'none', label: 'No grouping' },
  { value: 'releaseType', label: 'Release type' },
  { value: 'releaseDate', label: 'Release year' },
  { value: 'label', label: 'Label' },
] as const;

/** Ordering options for the display menu */
const ORDERING_OPTIONS = [
  { value: 'releaseDate', label: 'Release date' },
  { value: 'title', label: 'Title' },
  { value: 'popularity', label: 'Popularity' },
  { value: 'totalTracks', label: 'Track count' },
] as const;

/**
 * LinearStyleDisplayMenu - Display settings popover with Linear-style UI
 *
 * Features:
 * - Grouping dropdown row
 * - Ordering dropdown row
 * - Display properties as pill toggles
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
          className='h-8 gap-1.5 text-secondary-token'
        >
          <Icon name='SlidersHorizontal' className='h-4 w-4' />
          Display
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-72 p-0'>
        {/* Grouping row */}
        <div className='flex items-center justify-between px-3 py-2.5'>
          <div className='flex items-center gap-2 text-sm text-secondary-token'>
            <Icon name='Rows3' className='h-4 w-4' />
            Grouping
          </div>
          <Select defaultValue='none'>
            <SelectTrigger className='h-7 w-32 text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUPING_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Ordering row */}
        <div className='flex items-center justify-between px-3 py-2.5'>
          <div className='flex items-center gap-2 text-sm text-secondary-token'>
            <Icon name='ArrowUpDown' className='h-4 w-4' />
            Ordering
          </div>
          <Select defaultValue='releaseDate'>
            <SelectTrigger className='h-7 w-32 text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ORDERING_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {/* Display properties as pills */}
        <div className='p-3'>
          <p className='mb-2 text-xs text-tertiary-token'>Display properties</p>
          <div className='flex flex-wrap gap-1.5'>
            {availableColumns.map(col => {
              const isVisible = columnVisibility[col.id] !== false;
              return (
                <button
                  key={col.id}
                  type='button'
                  onClick={() => onColumnVisibilityChange(col.id, !isVisible)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
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
    <div className='flex items-center justify-between border-b border-subtle bg-base px-4 py-2'>
      {/* Left: Filter button */}
      <Button
        variant='ghost'
        size='sm'
        className='h-8 gap-1.5 text-secondary-token'
      >
        <Icon name='SlidersHorizontal' className='h-4 w-4' />
        Filter
        {activeFilterCount > 0 && (
          <span className='ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-medium text-white'>
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
