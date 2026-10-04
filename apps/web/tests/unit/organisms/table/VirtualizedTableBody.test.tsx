import type { VirtualItem } from '@tanstack/react-virtual';
import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { COLUMN_SNAP_STAGGER_CAP } from '@/components/organisms/table/column-snap';
import { VirtualizedTableBody } from '@/components/organisms/table/organisms/VirtualizedTableBody';
import { getCoreRowModel, type Row, useReactTable } from '@/lib/tanstack-table';

const tableContextMenuSpy = vi.fn();

vi.mock('@/components/organisms/table/organisms/VirtualizedTableRow', () => ({
  VirtualizedTableRow: ({
    row,
    columnSnap,
    columnSnapOrder,
    isFocused,
  }: {
    row: { id: string };
    columnSnap?: boolean;
    columnSnapOrder?: number;
    isFocused?: boolean;
  }) => (
    <tr
      data-focused={isFocused ? 'true' : 'false'}
      data-column-snap={columnSnap ? 'on' : 'off'}
      data-column-snap-order={
        columnSnapOrder == null ? '' : String(columnSnapOrder)
      }
      data-testid={`table-row-${row.id}`}
    >
      <td>{row.id}</td>
    </tr>
  ),
}));

vi.mock('@/components/organisms/table/molecules/TableContextMenu', () => ({
  TableContextMenu: (props: {
    children: ReactNode;
    searchable?: boolean;
    searchPlaceholder?: string;
    searchMode?: 'root' | 'recursive';
  }) => {
    tableContextMenuSpy(props);
    return <>{props.children}</>;
  },
}));

type TestRow = { id: string; name: string };

const createRow = (id: string, name: string): Row<TestRow> => {
  const { result } = renderHook(() =>
    useReactTable<TestRow>({
      data: [{ id, name }],
      columns: [],
      getRowId: row => row.id,
      getCoreRowModel: getCoreRowModel(),
    })
  );
  return result.current.getRowModel().rows[0]!;
};

const baseProps = {
  shouldEnableKeyboardNav: false,
  focusedIndex: -1,
  onFocusChange: vi.fn(),
  onKeyDown: vi.fn(),
  rowRefsMap: new Map<number, HTMLTableRowElement>(),
  columnCount: 1,
};

describe('VirtualizedTableBody', () => {
  it('skips stale virtual items whose index no longer maps to a row', () => {
    const rows = [createRow('1', 'One')];
    const staleVirtualRows = [
      { index: 5, start: 0, size: 44, end: 44, key: 'stale', lane: 0 },
    ] as VirtualItem[];

    render(
      <table>
        <VirtualizedTableBody
          {...baseProps}
          rows={rows}
          shouldVirtualize
          virtualRows={staleVirtualRows}
        />
      </table>
    );

    expect(screen.queryByTestId('table-row-1')).not.toBeInTheDocument();
  });

  it('renders the row for valid virtual indices', () => {
    const rows = [createRow('1', 'One')];
    const virtualRows = [
      { index: 0, start: 0, size: 44, end: 44, key: '0', lane: 0 },
    ] as VirtualItem[];

    render(
      <table>
        <VirtualizedTableBody
          {...baseProps}
          rows={rows}
          shouldVirtualize
          virtualRows={virtualRows}
        />
      </table>
    );

    expect(screen.getByTestId('table-row-1')).toBeInTheDocument();
  });

  it('forwards searchable context-menu configuration for virtual rows', () => {
    const rows = [createRow('1', 'One')];

    render(
      <table>
        <VirtualizedTableBody
          {...baseProps}
          rows={rows}
          shouldVirtualize={false}
          getContextMenuItems={() => []}
          contextMenuSearchable
          contextMenuSearchPlaceholder='Search actions'
          contextMenuSearchMode='recursive'
        />
      </table>
    );

    expect(tableContextMenuSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        searchable: true,
        searchPlaceholder: 'Search actions',
        searchMode: 'recursive',
      })
    );
  });

  it('lays virtual rows out between spacer rows without positioning the tbody', () => {
    const rows = [createRow('1', 'One'), createRow('2', 'Two')];
    const virtualRows = [
      { index: 1, start: 44, size: 44, end: 88, key: '1', lane: 0 },
    ] as VirtualItem[];

    const { container } = render(
      <table>
        <VirtualizedTableBody
          {...baseProps}
          rows={rows}
          shouldVirtualize
          virtualRows={virtualRows}
          paddingTop={44}
          paddingBottom={792}
        />
      </table>
    );

    const tbody = container.querySelector('tbody');
    expect(tbody?.style.position).toBe('');
    expect(tbody?.style.height).toBe('');
    const bodyRows = [...(tbody?.children ?? [])] as HTMLElement[];
    expect(bodyRows).toHaveLength(3);
    expect(bodyRows[0].querySelector('td')?.style.height).toBe('44px');
    expect(bodyRows[1]).toBe(screen.getByTestId('table-row-2'));
    expect(bodyRows[2].querySelector('td')?.style.height).toBe('792px');
  });

  it('staggers the column snap by painted order, not the dataset index', () => {
    const rows = [createRow('1', 'One'), createRow('2', 'Two')];
    const virtualRows = [
      { index: 1, start: 44, size: 44, end: 88, key: '1', lane: 0 },
    ] as VirtualItem[];

    render(
      <table>
        <VirtualizedTableBody
          {...baseProps}
          rows={rows}
          shouldVirtualize
          virtualRows={virtualRows}
          columnSnap
        />
      </table>
    );

    const row = screen.getByTestId('table-row-2');
    expect(row).toHaveAttribute('data-column-snap', 'on');
    expect(row).toHaveAttribute('data-column-snap-order', '0');
  });

  it('hands each row a focus boolean so j/k re-renders only two rows', () => {
    const rows = [createRow('1', 'One'), createRow('2', 'Two')];

    render(
      <table>
        <VirtualizedTableBody
          {...baseProps}
          rows={rows}
          shouldVirtualize={false}
          focusedIndex={1}
        />
      </table>
    );

    expect(screen.getByTestId('table-row-1')).toHaveAttribute(
      'data-focused',
      'false'
    );
    expect(screen.getByTestId('table-row-2')).toHaveAttribute(
      'data-focused',
      'true'
    );
  });

  it('caps the stagger order so rows past the cap keep stable props', () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      createRow(String(index), `Row ${index}`)
    );

    render(
      <table>
        <VirtualizedTableBody
          {...baseProps}
          rows={rows}
          shouldVirtualize={false}
          columnSnap
        />
      </table>
    );

    expect(screen.getByTestId('table-row-3')).toHaveAttribute(
      'data-column-snap-order',
      '3'
    );
    expect(screen.getByTestId('table-row-9')).toHaveAttribute(
      'data-column-snap-order',
      String(COLUMN_SNAP_STAGGER_CAP)
    );
  });
});
