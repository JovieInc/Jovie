'use client';

import { memo } from 'react';
import { ExportCSVButton } from '@/components/organisms/table';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
import { AudienceFilterDropdown } from './AudienceFilterDropdown';
import type { AudienceFilters } from './types';
import {
  AUDIENCE_CSV_COLUMNS,
  getAudienceForExport,
} from './utils/exportAudience';

export type AudienceView = 'all' | 'subscribers' | 'anonymous';

interface AudienceTableSubheaderProps {
  /** Current active view filter */
  readonly view: AudienceView;
  /** Callback when view filter changes */
  readonly onViewChange: (view: AudienceView) => void;
  /** Current filter state */
  readonly filters: AudienceFilters;
  /** Callback when filters change */
  readonly onFiltersChange: (filters: AudienceFilters) => void;
  /** Current rows for CSV export */
  readonly rows: AudienceMember[];
  /** Selected row IDs for filtered export */
  readonly selectedIds: Set<string>;
  /** Total subscriber count (export disabled when 0) */
  readonly subscriberCount: number;
  /** Total row count for the current view */
  readonly total: number;
}

const VIEW_OPTIONS: { value: AudienceView; label: string }[] = [
  { value: 'all', label: 'All audience' },
  { value: 'subscribers', label: 'Subscribers' },
  { value: 'anonymous', label: 'Anonymous' },
];

/**
 * AudienceTableSubheader - Subheader with view filter tabs, Filter dropdown,
 * and Export CSV button.
 *
 * Follows the same pattern as ReleaseTableSubheader:
 * - Left: View tabs + Filter dropdown with active filter pills
 * - Right: Export CSV
 */
export const AudienceTableSubheader = memo(function AudienceTableSubheader({
  view,
  onViewChange,
  filters,
  onFiltersChange,
  rows,
  selectedIds,
  subscriberCount,
  total,
}: AudienceTableSubheaderProps) {
  const hasData = total > 0;
  const showFilters = view !== 'subscribers';

  const pillButtonClass =
    'h-7 gap-1.5 rounded-md border border-transparent text-secondary-token transition-colors duration-150 hover:bg-surface-2 hover:text-primary-token';

  return (
    <div className='border-b border-subtle bg-transparent'>
      {/* Single row: View tabs + Filter + Export */}
      <div className='flex items-center justify-between px-4 py-1'>
        {/* Left: View filter tabs + Filter dropdown */}
        <div className='flex items-center gap-2'>
          <fieldset className='inline-flex items-center gap-0.5 rounded-md bg-transparent p-0'>
            <legend className='sr-only'>Audience view filter</legend>
            {VIEW_OPTIONS.map(option => (
              <button
                key={option.value}
                type='button'
                onClick={() => onViewChange(option.value)}
                aria-pressed={view === option.value}
                className={cn(
                  'h-7 px-2.5 text-xs font-medium rounded-md transition-colors',
                  view === option.value
                    ? 'bg-surface-2 text-primary-token'
                    : 'text-tertiary-token hover:text-secondary-token'
                )}
              >
                {option.label}
              </button>
            ))}
          </fieldset>

          {showFilters && (
            <AudienceFilterDropdown
              filters={filters}
              onFiltersChange={onFiltersChange}
              buttonClassName={pillButtonClass}
            />
          )}
        </div>

        {/* Right: Export CSV */}
        <div className='flex items-center gap-2'>
          <ExportCSVButton
            getData={() => getAudienceForExport(rows, selectedIds)}
            columns={AUDIENCE_CSV_COLUMNS}
            filename='audience'
            label={
              selectedIds.size > 0 ? `Export ${selectedIds.size}` : 'Export'
            }
            disabled={!hasData && subscriberCount === 0}
            variant='ghost'
            size='sm'
            className='h-7 gap-1.5 rounded-md border border-transparent text-secondary-token transition-colors duration-150 hover:bg-surface-2 hover:text-primary-token'
          />
        </div>
      </div>
    </div>
  );
});
