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

/** Popularity level for filtering */
export type PopularityLevel = 'low' | 'med' | 'high';

/** Filter state for releases table */
export interface ReleaseFilters {
  releaseTypes: ReleaseType[];
  readonly popularity: PopularityLevel[];
  readonly labels: string[];
}

/** Default filter state */
export const DEFAULT_RELEASE_FILTERS: ReleaseFilters = {
  releaseTypes: [],
  popularity: [],
  labels: [],
};

/** Release view filter type */
export type ReleaseView = 'all' | 'singles' | 'albums';

interface ReleaseTableSubheaderProps {
  /** All releases for export */
  readonly releases: ReleaseViewModel[];
  /** Selected release IDs for filtered export */
  readonly selectedIds: Set<string>;
  /** Column visibility state */
  readonly columnVisibility: Record<string, boolean>;
  /** Callback when column visibility changes */
  readonly onColumnVisibilityChange: (
    columnId: string,
    visible: boolean
  ) => void;
  /** Available columns to toggle */
  readonly availableColumns: readonly { id: string; label: string }[];
  /** Callback to reset display settings to defaults */
  readonly onResetToDefaults?: () => void;
  /** Current filter state */
  readonly filters: ReleaseFilters;
  /** Callback when filters change */
  readonly onFiltersChange: (filters: ReleaseFilters) => void;
  /** Whether to show expandable track rows */
  readonly showTracks?: boolean;
  /** Callback when showTracks changes */
  readonly onShowTracksChange?: (show: boolean) => void;
  /** Whether to group releases by year */
  readonly groupByYear?: boolean;
  /** Callback when groupByYear changes */
  readonly onGroupByYearChange?: (group: boolean) => void;
  /** Current release view filter */
  readonly releaseView?: ReleaseView;
  /** Callback when release view changes */
  readonly onReleaseViewChange?: (view: ReleaseView) => void;
}

/** Options for release view segmented control */
const RELEASE_VIEW_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'singles', label: 'Singles' },
  { value: 'albums', label: 'Albums' },
] as const;

/** Segmented control for release type filter */
function ReleaseViewSegmentedControl({
  value,
  onChange,
}: {
  value: ReleaseView;
  onChange: (value: ReleaseView) => void;
}) {
  return (
    <fieldset className='inline-flex rounded-md bg-transparent p-0'>
      <legend className='sr-only'>Release type filter</legend>
      {RELEASE_VIEW_OPTIONS.map(option => (
        <button
          key={option.value}
          type='button'
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            'h-7 px-2.5 text-xs font-medium rounded-md transition-colors',
            value === option.value
              ? 'bg-surface-2 text-primary-token'
              : 'text-tertiary-token hover:text-secondary-token'
          )}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

/** Toggle switch component for display menu options */
function ToggleSwitch({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type='button'
      role='switch'
      aria-checked={checked}
      onClick={onToggle}
      className='flex w-full items-center justify-between gap-2 rounded px-1 py-1 focus-visible:outline-none focus-visible:bg-interactive-hover'
    >
      <span className='text-[13px] text-secondary-token'>{label}</span>
      <span
        className={cn(
          'flex h-[18px] w-[30px] items-center rounded-full p-[3px] transition-colors',
          checked ? 'bg-primary' : 'bg-white/[0.12]'
        )}
      >
        <span
          className={cn(
            'h-3 w-3 rounded-full bg-white shadow-sm transition-transform',
            checked && 'translate-x-3'
          )}
        />
      </span>
    </button>
  );
}

/**
 * LinearStyleDisplayMenu - Compact display settings popover
 *
 * Features:
 * - Display properties as pill toggles (tightened spacing)
 * - Show tracks toggle for expandable album rows
 */
function LinearStyleDisplayMenu({
  columnVisibility,
  onColumnVisibilityChange,
  availableColumns,
  onResetToDefaults,
  showTracks,
  onShowTracksChange,
  groupByYear,
  onGroupByYearChange,
  releaseView,
  onReleaseViewChange,
  triggerClassName,
}: {
  columnVisibility: Record<string, boolean>;
  onColumnVisibilityChange: (columnId: string, visible: boolean) => void;
  availableColumns: readonly { id: string; label: string }[];
  onResetToDefaults?: () => void;
  showTracks?: boolean;
  onShowTracksChange?: (show: boolean) => void;
  groupByYear?: boolean;
  onGroupByYearChange?: (group: boolean) => void;
  releaseView?: ReleaseView;
  onReleaseViewChange?: (view: ReleaseView) => void;
  triggerClassName?: string;
}) {
  return (
    <Popover>
      <TooltipShortcut label='Display' shortcut='⇧V' side='bottom'>
        <PopoverTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className={cn(
              'h-7 gap-1.5 rounded-md border border-transparent text-secondary-token transition-colors duration-150 hover:bg-surface-2 hover:text-primary-token',
              triggerClassName
            )}
          >
            <Icon name='SlidersHorizontal' className='h-3.5 w-3.5' />
            Display
          </Button>
        </PopoverTrigger>
      </TooltipShortcut>
      <PopoverContent align='end' className='w-56 p-0'>
        {/* Release view toggle */}
        {onReleaseViewChange && (
          <div className='border-b border-subtle px-3 py-2'>
            <ReleaseViewSegmentedControl
              value={releaseView ?? 'all'}
              onChange={onReleaseViewChange}
            />
          </div>
        )}
        {/* List options */}
        {(onShowTracksChange || onGroupByYearChange) && (
          <div className='border-b border-subtle px-2 py-1.5 space-y-0'>
            <p className='px-1 py-1 text-[11px] font-medium text-tertiary-token'>
              List options
            </p>
            {onShowTracksChange && (
              <ToggleSwitch
                label='Show tracks'
                checked={showTracks ?? false}
                onToggle={() => onShowTracksChange(!showTracks)}
              />
            )}
            {onGroupByYearChange && (
              <ToggleSwitch
                label='Group by year'
                checked={groupByYear ?? false}
                onToggle={() => onGroupByYearChange(!groupByYear)}
              />
            )}
          </div>
        )}

        {/* Column visibility (Fields) */}
        {availableColumns.length > 0 && (
          <div className='px-2 py-1.5'>
            <p className='px-1 py-1 text-[11px] font-medium text-tertiary-token'>
              Properties
            </p>
            <div className='flex flex-wrap gap-1 px-1'>
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
                      'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:bg-interactive-hover',
                      isVisible
                        ? 'bg-white/[0.08] text-secondary-token'
                        : 'text-tertiary-token hover:text-secondary-token hover:bg-white/[0.04]'
                    )}
                  >
                    {col.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* Reset to defaults */}
        {onResetToDefaults && (
          <div className='border-t border-subtle px-3 py-1.5'>
            <button
              type='button'
              onClick={onResetToDefaults}
              className='text-[11px] text-tertiary-token hover:text-secondary-token transition-colors rounded px-1 py-1 focus-visible:outline-none focus-visible:bg-interactive-hover'
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
  showTracks,
  onShowTracksChange,
  groupByYear,
  onGroupByYearChange,
  releaseView = 'all',
  onReleaseViewChange,
}: ReleaseTableSubheaderProps) {
  // Compute filter counts for displaying badges
  const counts = useReleaseFilterCounts(releases);

  const pillButtonClass =
    'h-7 gap-1.5 rounded-md border border-transparent text-secondary-token transition-colors duration-150 hover:bg-surface-2 hover:text-primary-token';

  return (
    <div className='flex items-center justify-between border-b border-subtle bg-transparent px-4 py-1'>
      {/* Left: Filter */}
      <div className='flex items-center gap-2'>
        <ReleaseFilterDropdown
          filters={filters}
          onFiltersChange={onFiltersChange}
          counts={counts}
          buttonClassName={pillButtonClass}
        />
      </div>

      {/* Right: Display + Export */}
      <div className='flex items-center gap-2'>
        <LinearStyleDisplayMenu
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={onColumnVisibilityChange}
          availableColumns={availableColumns}
          onResetToDefaults={onResetToDefaults}
          showTracks={showTracks}
          onShowTracksChange={onShowTracksChange}
          groupByYear={groupByYear}
          onGroupByYearChange={onGroupByYearChange}
          releaseView={releaseView}
          onReleaseViewChange={onReleaseViewChange}
          triggerClassName={pillButtonClass}
        />
        <ExportCSVButton
          getData={() => getReleasesForExport(releases, selectedIds)}
          columns={RELEASES_CSV_COLUMNS}
          filename='releases'
          label={selectedIds.size > 0 ? `Export ${selectedIds.size}` : 'Export'}
          variant='ghost'
          size='sm'
          className={pillButtonClass}
        />
      </div>
    </div>
  );
});
