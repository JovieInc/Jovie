import type { Row } from '@tanstack/react-table';
import type { VirtualItem } from '@tanstack/react-virtual';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { VirtualizedTableBody } from '@/components/organisms/table/organisms/VirtualizedTableBody';

vi.mock('@/components/organisms/table/organisms/VirtualizedTableRow', () => ({
  VirtualizedTableRow: ({ row }: { row: { id: string } }) => (
    <tr data-testid={`table-row-${row.id}`}>
      <td>{row.id}</td>
    </tr>
  ),
}));

vi.mock('@/components/organisms/table/molecules/TableContextMenu', () => ({
  TableContextMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

type TestRow = { id: string; name: string };

const createRow = (id: string, name: string): Row<TestRow> =>
  ({
    id,
    original: { id, name },
  }) as Row<TestRow>;

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
});
