'use client';

import { memo } from 'react';
import { ExportCSVButton } from '@/components/organisms/table';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
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
  /** Current active segment filter */
  readonly filter: string | null;
  /** Callback when segment filter changes */
  readonly onFilterChange: (filter: string | null) => void;
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

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'highIntent', label: 'High Intent' },
  { value: 'returning', label: 'Returning' },
  { value: 'frequent', label: '3+ Visits' },
  { value: 'recent24h', label: 'Last 24h' },
];

/**
 * AudienceTableSubheader - Subheader with view filter tabs, segment filter pills,
 * and Export CSV button.
 *
 * Top row: View tabs (All audience | Subscribers | Anonymous) + Export CSV
 * Bottom row: Segment filter pills (High Intent | Returning | 3+ Visits | Last 24h)
 */
export const AudienceTableSubheader = memo(function AudienceTableSubheader({
  view,
  onViewChange,
  filter,
  onFilterChange,
  rows,
  selectedIds,
  subscriberCount,
  total,
}: AudienceTableSubheaderProps) {
  const hasData = total > 0;
  const showFilters = view !== 'subscribers';

  return (
    <div className='border-b border-subtle bg-transparent'>
      {/* Top row: View tabs + Export */}
      <div className='flex items-center justify-between px-4 py-1'>
        {/* Left: View filter tabs */}
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

        {/* Right: Export CSV */}
        <div className='flex items-center gap-2'>
          <ExportCSVButton
            getData={() => getAudienceForExport(rows, selectedIds)}
            columns={AUDIENCE_CSV_COLUMNS}
            filename='audience'
            label={selectedIds.size > 0 ? `Export ${selectedIds.size}` : 'Export'}
            disabled={!hasData && subscriberCount === 0}
            variant='ghost'
            size='sm'
            className='h-7 gap-1.5 rounded-md border border-transparent text-secondary-token transition-colors duration-150 hover:bg-surface-2 hover:text-primary-token'
          />
        </div>
      </div>

      {/* Bottom row: Segment filter pills (only shown for members views) */}
      {showFilters && (
        <div className='flex items-center gap-1.5 px-4 pb-2'>
          <span className='text-[11px] text-tertiary-token mr-1'>Segment:</span>
          {FILTER_OPTIONS.map(option => {
            const isActive = filter === option.value;
            return (
              <button
                key={option.value}
                type='button'
                onClick={() =>
                  onFilterChange(isActive ? null : option.value)
                }
                aria-pressed={isActive}
                className={cn(
                  'h-6 px-2.5 text-[11px] font-medium rounded-full border transition-colors',
                  isActive
                    ? 'border-primary-token/30 bg-surface-2 text-primary-token'
                    : 'border-subtle text-tertiary-token hover:text-secondary-token hover:border-secondary-token/30'
                )}
              >
                {option.label}
              </button>
            );
          })}
          {filter && (
            <button
              type='button'
              onClick={() => onFilterChange(null)}
              className='h-6 px-2 text-[11px] text-tertiary-token hover:text-secondary-token transition-colors'
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
});
