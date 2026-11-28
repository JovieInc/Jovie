import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ColumnDef } from '@/lib/tanstack-table';
import { UnifiedTable } from './UnifiedTable';

interface Row {
  readonly id: string;
  readonly name: string;
  readonly note: string | null;
  readonly flag: boolean;
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name', meta: { primary: true } },
  {
    id: 'note',
    header: 'Note',
    accessorFn: row => row.note,
    meta: { hideWhenEmpty: true },
  },
  {
    id: 'flag',
    header: 'Flag',
    cell: () => 'x',
    meta: { hideWhenEmpty: true, hasValue: row => row.flag },
  },
];

const render1 = (data: Row[]) =>
  render(
    <UnifiedTable
      data={data}
      columns={columns}
      getRowId={r => r.id}
      isLoading={false}
      rowMode='dense'
      enableVirtualization={false}
    />
  );

describe('UnifiedTable meta.hideWhenEmpty', () => {
  it('hides columns no loaded row has a value for', () => {
    render1([{ id: '1', name: 'A', note: null, flag: false }]);
    expect(screen.queryByText('Note')).not.toBeInTheDocument();
    expect(screen.queryByText('Flag')).not.toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('shows a column as soon as one row has a value', () => {
    render1([
      { id: '1', name: 'A', note: null, flag: false },
      { id: '2', name: 'B', note: 'hi', flag: true },
    ]);
    expect(screen.getByText('Note')).toBeInTheDocument();
    expect(screen.getByText('Flag')).toBeInTheDocument();
  });

  it('keeps columns when there are no rows (empty state)', () => {
    render1([]);
    expect(screen.getByText('Note')).toBeInTheDocument();
  });
});
