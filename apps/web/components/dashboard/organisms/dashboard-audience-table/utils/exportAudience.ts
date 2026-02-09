/**
 * CSV export configuration for audience table.
 * Defines column mapping and formatting for CSV export.
 */

import type { AudienceMember } from '@/types';
import { capitalize, type CSVColumn } from '@/lib/utils/csv';

/**
 * CSV column configuration for audience export.
 */
export const AUDIENCE_CSV_COLUMNS: CSVColumn<AudienceMember>[] = [
  { header: 'Name', accessor: 'displayName', formatter: v => (v as string) || 'Anonymous' },
  { header: 'Type', accessor: 'type', formatter: v => capitalize(v) },
  { header: 'Email', accessor: 'email', formatter: v => (v as string) || '' },
  { header: 'Phone', accessor: 'phone', formatter: v => (v as string) || '' },
  { header: 'Location', accessor: 'locationLabel' },
  { header: 'Device', accessor: 'deviceType', formatter: v => (v as string) || '' },
  { header: 'Visits', accessor: 'visits' },
  { header: 'Engagement Score', accessor: 'engagementScore' },
  { header: 'Intent', accessor: 'intentLevel', formatter: v => capitalize(v) },
  {
    header: 'Tags',
    accessor: 'tags',
    formatter: value => ((value as string[]) || []).join(', '),
  },
  { header: 'Last Seen', accessor: 'lastSeenAt', formatter: v => (v as string) || '' },
];

/**
 * Get audience data for CSV export.
 * Can export all rows or just selected ones.
 */
export function getAudienceForExport(
  rows: AudienceMember[],
  selectedIds?: Set<string>
): AudienceMember[] {
  if (selectedIds && selectedIds.size > 0) {
    return rows.filter(r => selectedIds.has(r.id));
  }
  return rows;
}
