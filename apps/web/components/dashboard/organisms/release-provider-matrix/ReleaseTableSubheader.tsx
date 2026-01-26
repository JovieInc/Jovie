'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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

/** Release type options for filter */
const RELEASE_TYPE_OPTIONS: { value: ReleaseType; label: string }[] = [
  { value: 'album', label: 'Album' },
  { value: 'ep', label: 'EP' },
  { value: 'single', label: 'Single' },
  { value: 'compilation', label: 'Compilation' },
];

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
  // Calculate active filter count
  const activeFilterCount =
    filters.releaseTypes.length + (filters.availability !== 'all' ? 1 : 0);

  const handleTypeToggle = (type: ReleaseType) => {
    const newTypes = filters.releaseTypes.includes(type)
      ? filters.releaseTypes.filter(t => t !== type)
      : [...filters.releaseTypes, type];
    onFiltersChange({ ...filters, releaseTypes: newTypes });
  };

  const handleAvailabilityChange = (
    value: 'all' | 'complete' | 'incomplete'
  ) => {
    onFiltersChange({ ...filters, availability: value });
  };

  const handleClearFilters = () => {
    onFiltersChange(DEFAULT_RELEASE_FILTERS);
  };

  return (
    <div className='flex items-center justify-between border-b border-subtle bg-base px-4 py-1.5'>
      {/* Left: Filter dropdown */}
      <DropdownMenu>
        <TooltipShortcut label='Filter' shortcut='F' side='bottom'>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='sm'
              aria-label='Filter releases'
              className='h-7 gap-1.5 text-secondary-token hover:bg-surface-2 hover:text-primary-token'
            >
              <Icon name='Filter' className='h-3.5 w-3.5' />
              Filter
              {activeFilterCount > 0 && (
                <span className='ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-white'>
                  {activeFilterCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipShortcut>
        <DropdownMenuContent align='start' className='w-48'>
          <DropdownMenuLabel>Type</DropdownMenuLabel>
          {RELEASE_TYPE_OPTIONS.map(option => (
            <DropdownMenuCheckboxItem
              key={option.value}
              checked={filters.releaseTypes.includes(option.value)}
              onCheckedChange={() => handleTypeToggle(option.value)}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Availability</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={filters.availability}
            onValueChange={v =>
              handleAvailabilityChange(v as 'all' | 'complete' | 'incomplete')
            }
          >
            <DropdownMenuRadioItem value='all'>All</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value='complete'>
              Complete
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value='incomplete'>
              Missing providers
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          {activeFilterCount > 0 && (
            <>
              <DropdownMenuSeparator />
              <button
                type='button'
                onClick={handleClearFilters}
                className='w-full px-2 py-1.5 text-left text-[11px] text-tertiary-token transition-colors hover:text-secondary-token'
              >
                Clear filters
              </button>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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
