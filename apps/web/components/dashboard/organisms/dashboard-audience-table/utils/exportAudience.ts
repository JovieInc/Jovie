/**
 * CSV export configuration for audience table.
 * Defines column mapping and formatting for CSV export.
 */

import { type CSVColumn, capitalize } from '@/lib/utils/csv';
import type { AudienceMember } from '@/types';

/**
 * CSV column configuration for audience export.
 */
export const AUDIENCE_CSV_COLUMNS: CSVColumn<AudienceMember>[] = [
  {
    header: 'Name',
    accessor: 'displayName',
    formatter: v => (v as string) || 'Anonymous',
  },
  { header: 'Email', accessor: 'email', formatter: v => (v as string) || '' },
  { header: 'Phone', accessor: 'phone', formatter: v => (v as string) || '' },
  { header: 'Intent', accessor: 'intentLevel', formatter: v => capitalize(v) },
  {
    header: 'Returning',
    accessor: 'visits',
    formatter: v => (Number(v) > 1 ? 'Yes' : 'No'),
  },
  { header: 'Visits', accessor: 'visits' },
  {
    header: 'Source',
    accessor: 'referrerHistory',
    formatter: v => {
      const history = v as { url: string }[] | null;
      if (!history || !Array.isArray(history) || history.length === 0)
        return 'Direct';
      try {
        const url = new URL(history[0].url);
        return url.searchParams.get('utm_source') ?? url.hostname.replace('www.', '');
      } catch {
        return history[0].url || 'Direct';
      }
    },
  },
  {
    header: 'Last Action',
    accessor: 'latestActions',
    formatter: v => {
      const actions = v as { label: string }[] | null;
      if (!actions || !Array.isArray(actions) || actions.length === 0) return '';
      return actions[0].label;
    },
  },
  { header: 'Location', accessor: 'locationLabel' },
  { header: 'Type', accessor: 'type', formatter: v => capitalize(v) },
  { header: 'Engagement Score', accessor: 'engagementScore' },
  {
    header: 'Tags',
    accessor: 'tags',
    formatter: value => ((value as string[]) || []).join(', '),
  },
  {
    header: 'Last Seen',
    accessor: 'lastSeenAt',
    formatter: v => (v as string) || '',
  },
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
