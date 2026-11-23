'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { UnifiedTable } from '@/components/organisms/table';
import type { ColumnDef } from '@/lib/tanstack-table';

export interface DashboardsTableRow {
  readonly id: string;
  readonly title: string;
  readonly token: string;
  readonly source: 'agent' | 'user';
  readonly updatedAt: string;
}

export function DashboardsTable({
  rows,
}: Readonly<{ rows: readonly DashboardsTableRow[] }>) {
  const columns = useMemo<ColumnDef<DashboardsTableRow, unknown>[]>(
    () => [
      {
        id: 'title',
        header: 'Title',
        enableSorting: false,
        size: 9999,
        accessorFn: row => row.title,
        cell: ({ row }) => (
          <Link
            href={`/v/${row.original.token}`}
            className='text-primary-token hover:underline'
          >
            {row.original.title}
          </Link>
        ),
      },
      {
        id: 'source',
        header: 'Source',
        enableSorting: false,
        size: 120,
        accessorFn: row => (row.source === 'agent' ? 'Agent' : 'You'),
        cell: ({ getValue }) => String(getValue()),
      },
      {
        id: 'updated',
        header: 'Updated',
        enableSorting: false,
        size: 140,
        accessorFn: row => row.updatedAt.slice(0, 10),
        cell: ({ getValue }) => (
          <span className='tabular-nums'>{String(getValue())}</span>
        ),
      },
    ],
    []
  );
  const data = useMemo(() => [...rows], [rows]);

  if (data.length === 0) {
    return (
      <p className='px-1 py-8 text-sm text-secondary-token'>
        No dashboards yet. Open a view an agent shares with you and save it
        here.
      </p>
    );
  }

  return (
    <div className='rounded-lg border border-subtle bg-surface-1 px-3'>
      <UnifiedTable
        data={data}
        columns={columns}
        caption='Your dashboards'
        rowMode='compact'
        minWidth='0'
        columnSnap={false}
        getRowId={row => row.id}
      />
    </div>
  );
}
