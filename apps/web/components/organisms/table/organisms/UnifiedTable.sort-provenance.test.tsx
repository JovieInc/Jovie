import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ColumnDef, SortingState } from '@/lib/tanstack-table';
import { UnifiedTable } from './UnifiedTable';

type TestRow = { id: string; name: string };

const data: TestRow[] = [
  { id: 'one', name: 'One' },
  { id: 'two', name: 'Two' },
];

const columns: ColumnDef<TestRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
];

const columnsWithFunctionHeader: ColumnDef<TestRow, unknown>[] = [
  {
    id: 'releaseDate',
    accessorKey: 'name',
    header: () => null,
  },
];

const sortedAsc: SortingState = [{ id: 'name', desc: false }];
const sortedDesc: SortingState = [{ id: 'name', desc: true }];

describe('UnifiedTable sort provenance (eval G4)', () => {
  it('shows sort provenance when the header is hidden and sorting is active', () => {
    render(
      <UnifiedTable
        data={data}
        columns={columns}
        hideHeader
        enableVirtualization={false}
        getRowId={row => row.id}
        sorting={sortedAsc}
        onSortingChange={vi.fn()}
      />
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Sorted by Name, ascending');
    // JOV-7710: the sticky status paints the main plane's own material.
    expect(status).toHaveClass('bg-(--app-shell-content-surface)');
    expect(status.className).not.toContain('bg-surface-1');
  });

  it('announces descending sort direction when the header is hidden', () => {
    render(
      <UnifiedTable
        data={data}
        columns={columns}
        hideHeader
        enableVirtualization={false}
        getRowId={row => row.id}
        sorting={sortedDesc}
        onSortingChange={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Sorted by Name, descending'
    );
  });

  it('humanizes the column id when no string header label exists', () => {
    render(
      <UnifiedTable
        data={data}
        columns={columnsWithFunctionHeader}
        hideHeader
        enableVirtualization={false}
        getRowId={row => row.id}
        sorting={[{ id: 'releaseDate', desc: true }]}
        onSortingChange={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Sorted by Release Date, descending'
    );
  });

  it('renders no sort status when the header is visible', () => {
    render(
      <UnifiedTable
        data={data}
        columns={columns}
        enableVirtualization={false}
        getRowId={row => row.id}
        sorting={sortedAsc}
        onSortingChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders no sort status when nothing is sorted', () => {
    render(
      <UnifiedTable
        data={data}
        columns={columns}
        hideHeader
        enableVirtualization={false}
        getRowId={row => row.id}
        sorting={[]}
        onSortingChange={vi.fn()}
      />
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps sort provenance visible while loading', () => {
    render(
      <UnifiedTable
        data={data}
        columns={columns}
        hideHeader
        isLoading
        skeletonRows={2}
        getRowId={row => row.id}
        sorting={sortedAsc}
        onSortingChange={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Sorted by Name, ascending'
    );
  });

  it('uses the surface caption when one is provided', () => {
    const { container } = render(
      <UnifiedTable
        data={data}
        columns={columns}
        hideHeader
        enableVirtualization={false}
        getRowId={row => row.id}
        caption='Releases'
      />
    );

    expect(container.querySelector('caption')).toHaveTextContent('Releases');
  });
});
