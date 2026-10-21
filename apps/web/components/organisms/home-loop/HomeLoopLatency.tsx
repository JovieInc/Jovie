'use client';

// @coverage-via apps/web/components/organisms/home-loop/HomeLoopParts.test.tsx

import { TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { UnifiedTable } from '@/components/organisms/table';
import type { HomeLoopLatencyRow } from '@/lib/home-loop/contract';
import type { CellContext, ColumnDef } from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';

function StageCell({ row }: CellContext<HomeLoopLatencyRow, unknown>) {
  return (
    <span className='flex min-w-0 items-center gap-1.5'>
      <span className='truncate' title={row.original.label}>
        {row.original.label}
      </span>
      {row.original.regressed ? (
        <span className='inline-flex shrink-0 items-center gap-0.5 text-warning'>
          <TrendingUp aria-hidden='true' className='size-3' />
          Regressed
        </span>
      ) : null}
    </span>
  );
}

function P95Cell({ row }: CellContext<HomeLoopLatencyRow, unknown>) {
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        row.original.regressed ? 'text-warning' : 'text-primary-token'
      )}
    >
      {row.original.p95}
    </span>
  );
}

const COLUMNS: ColumnDef<HomeLoopLatencyRow, unknown>[] = [
  {
    accessorKey: 'label',
    header: 'Stage',
    size: 9999,
    enableSorting: false,
    cell: StageCell,
  },
  {
    accessorKey: 'p50',
    header: 'P50',
    size: 88,
    enableSorting: false,
    meta: { align: 'right', className: 'tabular-nums text-secondary-token' },
  },
  {
    accessorKey: 'p95',
    header: 'P95',
    size: 88,
    enableSorting: false,
    meta: { align: 'right' },
    cell: P95Cell,
  },
  {
    accessorKey: 'samples',
    header: 'Runs',
    size: 64,
    enableSorting: false,
    meta: { align: 'right', className: 'tabular-nums text-tertiary-token' },
  },
];

const getRowId = (row: HomeLoopLatencyRow) => row.id;
const getRowTestId = () => 'home-loop-latency-row';

/**
 * Slowest stages by 7-day p95, with regressions named in text. This is the
 * list Home asks the team to drive down; durations arrive pre-formatted and
 * unknown values read "Not measured".
 */
export function HomeLoopLatency({
  rows,
  otherRegressions = [],
  coverage,
}: Readonly<{
  readonly rows: readonly HomeLoopLatencyRow[];
  readonly otherRegressions?: readonly string[];
  readonly coverage?: string | null;
}>) {
  const data = useMemo(() => [...rows], [rows]);

  return (
    <div
      className='rounded-lg border border-subtle bg-surface-1 px-3'
      data-testid='home-loop-latency'
    >
      <UnifiedTable
        data={data}
        columns={COLUMNS}
        caption='Slowest stages by 7-day p95'
        rowMode='dense'
        minWidth='0'
        columnSnap={false}
        getRowId={getRowId}
        getRowTestId={getRowTestId}
      />
      {otherRegressions.length > 0 || coverage ? (
        <p className='border-t border-subtle py-1.5 text-2xs text-tertiary-token'>
          {otherRegressions.length > 0 ? (
            <span className='text-warning'>
              {`Also regressed: ${otherRegressions.join(', ')}`}
            </span>
          ) : null}
          {otherRegressions.length > 0 && coverage ? ' · ' : null}
          {coverage}
        </p>
      ) : null}
    </div>
  );
}
