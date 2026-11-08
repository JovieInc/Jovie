'use client';

import { EmptyCell } from '@/components/atoms/EmptyCell';
import { PersonCell } from '@/components/organisms/table/atoms/PersonCell';
import { UnifiedTable } from '@/components/organisms/table/organisms/UnifiedTable';
import type { FounderFunnelStageRows } from '@/lib/admin/types';
import { type ColumnDef, createColumnHelper } from '@/lib/tanstack-table';

type FounderFunnelStageRow = FounderFunnelStageRows['rows'][number];

function formatSignupDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const columnHelper = createColumnHelper<FounderFunnelStageRow>();

/**
 * The people a funnel stage counted, on the shared table: one PersonCell
 * (name with email as its quiet secondary fact) and the signup date, in the
 * dense 32px row every people table uses.
 */
const FOUNDER_FUNNEL_COLUMNS = [
  columnHelper.display({
    id: 'person',
    header: 'Person',
    size: 360,
    minSize: 240,
    cell: ({ row }) => {
      const { displayName, email } = row.original;
      const name = displayName ?? email;
      if (!name) return <EmptyCell />;
      return (
        <PersonCell
          name={name}
          secondary={displayName && email ? email : undefined}
        />
      );
    },
  }),
  columnHelper.accessor('enteredAt', {
    id: 'enteredAt',
    header: 'Signed Up',
    size: 140,
    minSize: 120,
    meta: { align: 'right' },
    cell: ({ getValue }) => {
      const value = getValue();
      return value ? (
        <span className='tabular-nums text-secondary-token'>
          {formatSignupDate(value)}
        </span>
      ) : (
        <EmptyCell />
      );
    },
  }),
] as ColumnDef<FounderFunnelStageRow, unknown>[];

export function FounderFunnelDrilldownTable({
  rows,
  stageLabel,
}: Readonly<{
  rows: FounderFunnelStageRows['rows'];
  stageLabel: string;
}>) {
  return (
    <UnifiedTable
      data={rows}
      columns={FOUNDER_FUNNEL_COLUMNS}
      rowMode='dense'
      getRowId={row => row.id}
      minWidth='0'
      className='text-app'
      caption={`${stageLabel} records`}
    />
  );
}
