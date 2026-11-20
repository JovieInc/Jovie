'use client';

import { EmptyCell } from '@/components/atoms/EmptyCell';
import { TableBadge } from '@/components/organisms/table/atoms/TableBadge';
import { type ColumnDef, createColumnHelper } from '@/lib/tanstack-table';
import type { LinkRow } from './links-model';

/**
 * Links workspace columns on the shared UnifiedTable. Row height, hover,
 * focus, selection and header alignment come from the shared row; columns
 * only own content, width and numeric alignment.
 */

export const LINKS_ROW_MODE = 'dense' as const;

const STATUS_LABELS: Record<LinkRow['status'], string> = {
  active: 'Active',
  draft: 'Draft',
  scheduled: 'Scheduled',
  archived: 'Archived',
};

const STATUS_VARIANTS: Record<
  LinkRow['status'],
  'primary' | 'secondary' | 'success' | 'warning'
> = {
  active: 'success',
  draft: 'secondary',
  scheduled: 'warning',
  archived: 'secondary',
};

export function LinkStatusBadge({
  status,
}: {
  readonly status: LinkRow['status'];
}) {
  return (
    <TableBadge variant={STATUS_VARIANTS[status]}>
      {STATUS_LABELS[status]}
    </TableBadge>
  );
}

export function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//u, '');
}

function TruncatedText({
  value,
  title,
  tone = 'primary',
}: {
  readonly value: string;
  readonly title?: string;
  readonly tone?: 'primary' | 'secondary';
}) {
  return (
    <span
      className={
        tone === 'secondary'
          ? 'block min-w-0 truncate text-secondary-token'
          : 'block min-w-0 truncate'
      }
      title={title ?? value}
    >
      {value}
    </span>
  );
}

const columnHelper = createColumnHelper<LinkRow>();

/**
 * Static column set. The Jovie link is a real button so the row has a tab
 * stop; its click bubbles to the shared row, whose onRowClick opens the
 * inspector, so there is one open path for pointer and keyboard.
 */
export const LINKS_COLUMNS: ColumnDef<LinkRow, unknown>[] = [
  columnHelper.accessor('title', {
    id: 'entity',
    header: 'Entity',
    size: 220,
    minSize: 160,
    cell: ({ getValue }) => <TruncatedText value={getValue()} />,
  }),
  columnHelper.accessor('type', {
    id: 'type',
    header: 'Type',
    size: 110,
    minSize: 96,
    cell: ({ getValue }) => (
      <TruncatedText value={getValue()} tone='secondary' />
    ),
  }),
  columnHelper.accessor('status', {
    id: 'status',
    header: 'Status',
    size: 110,
    minSize: 96,
    cell: ({ getValue }) => <LinkStatusBadge status={getValue()} />,
  }),
  columnHelper.accessor('destination', {
    id: 'destination',
    header: 'Destination',
    size: 240,
    minSize: 160,
    cell: ({ getValue }) => (
      <TruncatedText
        value={stripProtocol(getValue())}
        title={getValue()}
        tone='secondary'
      />
    ),
  }),
  columnHelper.accessor('clicks', {
    id: 'clicks',
    header: 'Clicks',
    size: 88,
    minSize: 72,
    meta: { align: 'right' },
    cell: ({ getValue }) => {
      const clicks = getValue();
      return clicks === null ? (
        <EmptyCell />
      ) : (
        <span className='tabular-nums'>{clicks}</span>
      );
    },
  }),
  columnHelper.display({
    id: 'campaign',
    header: 'Campaign',
    size: 160,
    minSize: 120,
    cell: ({ row }) => {
      const value = row.original.campaign ?? row.original.utmSummary;
      return value ? (
        <TruncatedText value={value} tone='secondary' />
      ) : (
        <EmptyCell />
      );
    },
  }),
  columnHelper.accessor('jovieUrl', {
    id: 'jovieUrl',
    header: 'Jovie Link',
    size: 220,
    minSize: 160,
    cell: ({ getValue }) => (
      <button
        type='button'
        className='block w-full min-w-0 truncate rounded-sm text-left text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
        title={getValue()}
      >
        {stripProtocol(getValue())}
      </button>
    ),
  }),
] as ColumnDef<LinkRow, unknown>[];
