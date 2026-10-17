'use client';

import { memo } from 'react';
import { z } from 'zod';
import { ExportCSVButton, PageToolbar } from '@/components/organisms/table';
import {
  type SubscriberExportRow,
  subscriberExportRowSchema,
} from '@/lib/notifications/subscriber-export';
import type { CSVColumn } from '@/lib/utils/csv';
import type { AudienceMember } from '@/types';
import { AudienceFilterDropdown } from './AudienceFilterDropdown';
import { AudienceHeaderBadge } from './AudienceHeaderBadge';
import type { AudienceFilters, AudienceView } from './types';
import {
  AUDIENCE_CSV_COLUMNS,
  getAudienceForExport,
} from './utils/exportAudience';

interface AudienceTableSubheaderProps {
  readonly mode?: 'members' | 'subscribers';
  readonly profileId?: string;
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
  mode = 'members',
  profileId,
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
  const getSubscriberData = async (): Promise<SubscriberExportRow[]> => {
    if (!profileId)
      throw new Error('Select a profile before exporting subscribers.');
    const response = await fetch('/api/dashboard/audience/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId,
        selectedIds: selectedIds.size ? [...selectedIds] : undefined,
      }),
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const error = z.object({ error: z.string() }).safeParse(body);
      throw new Error(
        error.success ? error.data.error : 'Unable to export subscribers.'
      );
    }
    const result = z
      .object({ rows: z.array(subscriberExportRowSchema) })
      .safeParse(body);
    if (!result.success)
      throw new Error('Unable to prepare subscriber export.');
    return result.data.rows;
  };

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
            iconOnly
          />
          {mode === 'subscribers' ? (
            <ExportCSVButton
              key={profileId ?? 'missing-profile'}
              getData={getSubscriberData}
              revalidateBeforeDownload
              columns={SUBSCRIBER_EXPORT_COLUMNS}
              filename='subscribers'
              label='Export'
              tooltipLabel={exportTooltipLabel}
              disabled={!profileId || (!hasData && subscriberCount === 0)}
              variant='ghost'
              size='sm'
              chrome='page-toolbar'
              iconOnly
            />
          ) : (
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
              iconOnly
            />
          )}
        </>
      }
    />
  );
});

const SUBSCRIBER_EXPORT_COLUMNS: CSVColumn<SubscriberExportRow>[] = [
  { header: 'Name', accessor: 'name' },
  { header: 'Email', accessor: 'email' },
  { header: 'Country', accessor: 'countryCode' },
  { header: 'Consented At', accessor: 'consentedAt' },
];
