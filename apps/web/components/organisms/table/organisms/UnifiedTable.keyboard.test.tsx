import type { ColumnDef } from '@tanstack/react-table';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedTable } from './UnifiedTable';

type TestRow = { id: string; name: string };

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

describe('UnifiedTable keyboard interaction', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
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
        onRowClick={vi.fn()}
      />
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
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
});
