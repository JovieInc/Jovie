import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnDef } from '@/lib/tanstack-table';
import { TABLE_EMPTY_STATE_MIN_HEIGHT_PX } from '../atoms/TableEmptyState';
import { UnifiedTable } from './UnifiedTable';

vi.mock('./useTableVirtualization', () => ({
  useTableVirtualization: ({ enabled }: { readonly enabled: boolean }) => ({
    virtualizer: { measureElement: vi.fn() },
    virtualRows: enabled
      ? [{ index: 1, start: 44, size: 44, end: 88, key: 'two', lane: 0 }]
      : [],
    totalSize: enabled ? 132 : 0,
    paddingTop: enabled ? 44 : 0,
    paddingBottom: enabled ? 44 : 0,
  }),
}));

type TestRow = { id: string; name: string };
type AlignedTestRow = TestRow & { count: number };

const data: TestRow[] = [
  { id: 'one', name: 'One' },
  { id: 'two', name: 'Two' },
  { id: 'three', name: 'Three' },
];

const columns: ColumnDef<TestRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
];

const alignedData: AlignedTestRow[] = [{ id: 'one', name: 'One', count: 42 }];

const alignedColumns: ColumnDef<AlignedTestRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'count',
    header: 'Count',
    meta: { align: 'right' },
  },
];

describe('UnifiedTable keyboard interaction', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  it('fills the available content width without a route-owned max width', () => {
    const { container } = render(
      <UnifiedTable
        data={data}
        columns={columns}
        enableVirtualization={false}
      />
    );

    expect(container.firstElementChild).toHaveClass('w-full', 'min-w-0');
    expect(container.firstElementChild).not.toHaveClass('max-w-full');
    expect(container.querySelector('table')).toHaveClass('w-full');
    expect(container.querySelector('table')).not.toHaveClass('max-w-full');
  });

  it('keeps virtualized rows in table flow between spacer rows', () => {
    const { container } = render(
      <UnifiedTable
        data={data}
        columns={columns}
        hideHeader
        enableVirtualization
        rowHeight={44}
        getRowId={row => row.id}
        getRowTestId={row => `row-${row.id}`}
      />
    );

    const tbody = container.querySelector('tbody');
    expect(tbody).not.toBeNull();
    expect(tbody?.style.position).toBe('');
    expect(tbody?.style.height).toBe('');

    const bodyRows = [...(tbody?.children ?? [])] as HTMLTableRowElement[];
    const virtualRow = screen.getByTestId('row-two');
    expect(bodyRows).toHaveLength(3);
    expect(bodyRows[0].querySelector('td')?.style.height).toBe('44px');
    expect(bodyRows[1]).toBe(virtualRow);
    expect(bodyRows[2].querySelector('td')?.style.height).toBe('44px');
    expect(virtualRow.style.position).toBe('');
    expect(virtualRow.style.transform).toBe('');
  });

  it('uses instant scrolling when reduced motion is requested', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(
      <UnifiedTable
        data={data}
        columns={columns}
        hideHeader
        enableVirtualization={false}
        getRowId={row => row.id}
        getRowTestId={row => `row-${row.id}`}
        onRowClick={vi.fn()}
      />
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
    const first = screen.getByTestId('row-one');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(screen.getByTestId('row-two')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: 'nearest',
      behavior: 'auto',
    });
  });

  it('uses roving tabindex and moves keyboard focus without changing row height', async () => {
    const onFocusedRowChange = vi.fn();

    render(
      <UnifiedTable
        data={data}
        columns={columns}
        hideHeader
        enableVirtualization={false}
        getRowId={row => row.id}
        getRowTestId={row => `row-${row.id}`}
        onRowClick={vi.fn()}
        onFocusedRowChange={onFocusedRowChange}
      />
    );

    const first = screen.getByTestId('row-one');
    const second = screen.getByTestId('row-two');
    const third = screen.getByTestId('row-three');

    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    expect(third).toHaveAttribute('tabindex', '-1');
    expect(first).toHaveClass('system-b-table-row-height');

    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });

    await waitFor(() => expect(second).toHaveAttribute('tabindex', '0'));
    expect(first).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(second);
    expect(onFocusedRowChange).toHaveBeenCalledWith(1);
  });

  it('exposes consumer-owned selection through the shared selected row state', () => {
    const onRowClick = vi.fn();

    render(
      <UnifiedTable
        data={data}
        columns={columns}
        hideHeader
        enableVirtualization={false}
        getRowId={row => row.id}
        getRowTestId={row => `row-${row.id}`}
        isRowSelected={row => row.id === 'two'}
        onRowClick={onRowClick}
      />
    );

    const selected = screen.getByTestId('row-two');
    expect(selected).toHaveAttribute('aria-selected', 'true');
    expect(selected).toHaveClass('system-b-table-row-selected');

    fireEvent.keyDown(selected, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledWith(data[1]);
  });

  it('opens a searchable action menu from the row context gesture', async () => {
    render(
      <UnifiedTable
        data={data}
        columns={columns}
        hideHeader
        enableVirtualization={false}
        getRowId={row => row.id}
        getRowTestId={row => `row-${row.id}`}
        contextMenuSearchable
        contextMenuSearchPlaceholder='Search actions'
        contextMenuSearchMode='recursive'
        getContextMenuItems={() => [
          {
            id: 'copy-title',
            label: 'Copy Title',
            onClick: vi.fn(),
          },
        ]}
      />
    );

    fireEvent.contextMenu(screen.getByTestId('row-one'));

    expect(await screen.findByPlaceholderText('Search actions')).toHaveFocus();
  });

  it('reserves at least the empty state min-height in skeleton rows while loading', () => {
    const rowHeight = 32;

    render(
      <UnifiedTable
        data={data}
        columns={columns}
        hideHeader
        isLoading
        skeletonRows={2}
        rowHeight={rowHeight}
        getRowId={row => row.id}
        onRowClick={vi.fn()}
      />
    );

    expect(screen.getAllByRole('row')).toHaveLength(
      Math.ceil(TABLE_EMPTY_STATE_MIN_HEIGHT_PX / rowHeight)
    );
  });

  it('uses the canonical spinner while the next page is loading', () => {
    render(
      <UnifiedTable
        data={data}
        columns={columns}
        hideHeader
        enableVirtualization={false}
        getRowId={row => row.id}
        onLoadMore={vi.fn()}
        isFetchingNextPage
      />
    );

    const spinner = screen.getByRole('status', { name: 'Loading More' });
    expect(spinner).toHaveAttribute('data-size', 'sm');
    expect(spinner).toHaveAttribute('data-tone', 'muted');
  });

  it('keeps the column sort control keyboard-reachable with an announced state', () => {
    const onSortingChange = vi.fn();

    render(
      <UnifiedTable
        data={data}
        columns={columns}
        enableVirtualization={false}
        getRowId={row => row.id}
        sorting={[{ id: 'name', desc: false }]}
        onSortingChange={onSortingChange}
      />
    );

    const sortButton = screen.getByRole('button', {
      name: 'Name: sorted ascending',
    });
    expect(sortButton).not.toHaveAttribute('tabindex', '-1');

    sortButton.focus();
    expect(document.activeElement).toBe(sortButton);

    fireEvent.click(sortButton);
    expect(onSortingChange).toHaveBeenCalled();
  });

  it('applies column meta alignment to rendered body cells', () => {
    const { container } = render(
      <UnifiedTable
        data={alignedData}
        columns={alignedColumns}
        hideHeader
        enableVirtualization={false}
        getRowId={row => row.id}
      />
    );

    const firstRowCells = container.querySelectorAll('tbody tr:first-child td');
    expect(firstRowCells[1]).toHaveClass('text-right');
  });
});
