'use client';

import { memo } from 'react';
import {
  ActionBar,
  ActionBarItem,
  ExportCSVButton,
} from '@/components/organisms/table';
import type { AudienceMember } from '@/types';
import { AudienceFilterDropdown } from './AudienceFilterDropdown';
import { AudienceHeaderBadge } from './AudienceHeaderBadge';
import type { AudienceFilters, AudienceView } from './types';
import {
  AUDIENCE_CSV_COLUMNS,
  getAudienceForExport,
} from './utils/exportAudience';

interface AudienceTableSubheaderProps {
  /** Current active view filter */
  readonly view: AudienceView;
  /** Callback when audience view changes */
  readonly onViewChange: (view: AudienceView) => void;
  /** Current filter state */
  readonly filters: AudienceFilters;
  /** Callback when filters change */
  readonly onFiltersChange: (filters: AudienceFilters) => void;
  /** Current rows for CSV export */
  readonly rows: AudienceMember[];
  /** Selected row IDs for filtered export */
  readonly selectedIds: Set<string>;
  /** Total subscriber count. Null when the COUNT query was skipped for performance. */
  readonly subscriberCount: number | null;
  /** Total row count for the current view. Null when the COUNT query was skipped. */
  readonly total: number | null;
  /** Total audience members across all views. Null when the COUNT query was skipped. */
  readonly totalAudienceCount?: number | null;
}

/**
 * AudienceTableSubheader - Subheader with audience view selector and table actions.
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
  totalAudienceCount,
}: AudienceTableSubheaderProps) {
  const hasData = rows.length > 0;

  return (
    <div className='border-b border-subtle bg-transparent'>
      <div className='flex items-center justify-between px-4 py-1'>
        {/* Left: Audience view selector */}
        <div className='flex items-center gap-2'>
          <AudienceHeaderBadge
            view={view}
            onViewChange={onViewChange}
            totalAudienceCount={totalAudienceCount ?? total}
            subscriberCount={subscriberCount}
          />
        </div>

        {/* Right: Filter + Export CSV */}
        <ActionBar>
          <ActionBarItem tooltipLabel='Filter' shortcut='F'>
            <AudienceFilterDropdown
              filters={filters}
              onFiltersChange={onFiltersChange}
              buttonClassName='focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-offset-1'
            />
          </ActionBarItem>
          <ActionBarItem
            tooltipLabel={
              selectedIds.size > 0 ? `Export ${selectedIds.size}` : 'Export'
            }
          >
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
              className='focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-offset-1 whitespace-nowrap [&>span]:hidden [&>span]:sm:inline'
            />
          </ActionBarItem>
        </ActionBar>
      </div>
    </div>
  );
});
