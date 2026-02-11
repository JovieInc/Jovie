'use client';

import { memo } from 'react';
import { ExportCSVButton } from '@/components/organisms/table';
import type { AudienceMember } from '@/types';
import { AudienceFilterDropdown } from './AudienceFilterDropdown';
import type { AudienceFilters, AudienceView } from './types';
import {
  AUDIENCE_CSV_COLUMNS,
  getAudienceForExport,
} from './utils/exportAudience';

interface AudienceTableSubheaderProps {
  /** Current active view filter */
  readonly view: AudienceView;
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

/**
 * AudienceTableSubheader - Filter dropdown and Export CSV button.
 *
 * View tabs have been moved to the header via setHeaderBadge.
 * This subheader now only contains the segment filter + export.
 */
export const AudienceTableSubheader = memo(function AudienceTableSubheader({
  view,
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
      <div className='flex items-center justify-between px-4 py-1'>
        {/* Left: Filter dropdown */}
        <div className='flex items-center gap-2'>
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
