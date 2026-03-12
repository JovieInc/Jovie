'use client';

import { memo } from 'react';
import {
  ExportCSVButton,
  PAGE_TOOLBAR_ACTION_BUTTON_CLASS,
  PageToolbar,
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
  /** Total identified count. Null when the COUNT query was skipped for performance (JOV-1262). */
  readonly subscriberCount: number | null;
  /** Total row count for the current view. Null when the COUNT query was skipped (JOV-1262, JOV-1264). */
  readonly total: number | null;
  /** Total audience members across all views. Null when the COUNT query was skipped (JOV-1262). */
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
  const exportTooltipLabel =
    selectedIds.size > 0 ? `Export ${selectedIds.size}` : 'Export';

  return (
    <PageToolbar
      start={
        <AudienceHeaderBadge
          view={view}
          onViewChange={onViewChange}
          totalAudienceCount={totalAudienceCount ?? total}
          subscriberCount={subscriberCount}
        />
      }
      end={
        <>
          <AudienceFilterDropdown
            filters={filters}
            onFiltersChange={onFiltersChange}
            buttonClassName={PAGE_TOOLBAR_ACTION_BUTTON_CLASS}
          />
          <ExportCSVButton
            getData={() => getAudienceForExport(rows, selectedIds)}
            columns={AUDIENCE_CSV_COLUMNS}
            filename='audience'
            label='Export'
            tooltipLabel={exportTooltipLabel}
            disabled={!hasData && subscriberCount === 0}
            variant='ghost'
            size='sm'
            chrome='page-toolbar'
            className='whitespace-nowrap'
          />
        </>
      }
    />
  );
});
