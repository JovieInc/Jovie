'use client';

import { useMemo } from 'react';
import { UnifiedTable } from '@/components/organisms/table';
import type { ColumnDef } from '@/lib/tanstack-table';
import type { ViewBlock } from '@/lib/views/spec';

type TableBlock = Extract<ViewBlock, { type: 'table' }>;
type Row = TableBlock['rows'][number];

export function ViewTable({
  columns,
  rows,
  caption,
}: Readonly<{
  columns: TableBlock['columns'];
  rows: TableBlock['rows'];
  caption: string;
}>) {
  const defs = useMemo<ColumnDef<Row, unknown>[]>(
    () =>
      columns.map((column, index) => ({
        id: column.key,
        header: column.label,
        enableSorting: false,
        size: index === 0 ? 9999 : 140,
        accessorFn: (row: Row) => row[column.key] ?? '',
        cell: ({ getValue }) => String(getValue() ?? ''),
      })),
    [columns]
  );
  const data = useMemo(() => [...rows], [rows]);
  const rowIds = useMemo(
    () => new Map(data.map((row, index) => [row, String(index)])),
    [data]
  );
  return (
    <div className='rounded-lg border border-subtle bg-surface-1 px-3'>
      <UnifiedTable
        data={data}
        columns={defs}
        caption={caption}
        rowMode='dense'
        minWidth='0'
        columnSnap={false}
        getRowId={row => rowIds.get(row) ?? ''}
      />
    </div>
  );
}
