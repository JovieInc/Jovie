import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ColumnDef, RowSelectionState } from '@/lib/tanstack-table';
import { UnifiedTable } from './UnifiedTable';

type Row = { id: string; name: string };

const data: Row[] = [
  { id: 'a', name: 'Ada' },
  { id: 'b', name: 'Bo' },
  { id: 'c', name: 'Cy' },
  { id: 'd', name: 'Di' },
];

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
];

function ConsumerOwnedSelection({
  onSelection,
  provideSelectionState = true,
  grouped = false,
}: {
  readonly onSelection: (ids: string[]) => void;
  readonly provideSelectionState?: boolean;
  readonly grouped?: boolean;
}) {
  const [selected, setSelected] = useState<RowSelectionState>({});
  return (
    <UnifiedTable
      data={grouped ? data.slice(0, 3) : data}
      groupingConfig={
        grouped
          ? {
              getGroupKey: row => (row.id === 'b' ? 'Second' : 'First'),
              getGroupLabel: key => key,
            }
          : undefined
      }
      columns={columns}
      rowMode='dense'
      enableVirtualization={false}
      enableKeyboardNavigation
      getRowId={row => row.id}
      getRowTestId={row => `row-${row.id}`}
      rowSelection={provideSelectionState ? selected : undefined}
      onToggleRowSelection={row =>
        setSelected(prev => {
          const next = { ...prev };
          if (next[row.id]) delete next[row.id];
          else next[row.id] = true;
          onSelection(Object.keys(next).sort());
          return next;
        })
      }
    />
  );
}

describe('UnifiedTable keyboard selection', () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });

  it.each([true, false])(
    'keeps Space playback separate from Enter and selection (toggle=%s)',
    hasToggle => {
      const onRowClick = vi.fn();
      const onRowToggle = vi.fn();
      const onToggleRowSelection = vi.fn();
      render(
        <UnifiedTable
          data={data}
          columns={columns}
          enableVirtualization={false}
          enableKeyboardNavigation
          getRowId={row => row.id}
          getRowTestId={row => `row-${row.id}`}
          onRowClick={onRowClick}
          onRowToggle={hasToggle ? onRowToggle : undefined}
          onToggleRowSelection={onToggleRowSelection}
        />
      );
      const row = screen.getByTestId('row-b');
      act(() => row.focus());
      fireEvent.keyDown(row, { key: ' ' });
      expect(onRowToggle).toHaveBeenCalledTimes(hasToggle ? 1 : 0);
      expect(onRowClick).toHaveBeenCalledTimes(hasToggle ? 0 : 1);
      expect((hasToggle ? onRowToggle : onRowClick).mock.calls[0][0]).toEqual(
        data[1]
      );
      expect(onToggleRowSelection).not.toHaveBeenCalled();

      fireEvent.keyDown(row, { key: 'Enter' });
      expect(onRowClick).toHaveBeenCalledTimes(hasToggle ? 1 : 2);
      expect(onRowClick.mock.calls.at(-1)?.[0]).toEqual(data[1]);
      fireEvent.keyDown(row, { key: 'x' });
      expect(onToggleRowSelection).toHaveBeenCalledWith(data[1], 1);
      expect(row).toHaveFocus();
    }
  );

  it('toggles the focused row with x', () => {
    const onSelection = vi.fn();
    render(<ConsumerOwnedSelection onSelection={onSelection} />);

    fireEvent.keyDown(screen.getByTestId('row-b'), { key: 'x' });
    expect(onSelection).toHaveBeenLastCalledWith(['b']);
    expect(screen.getByTestId('row-b')).toHaveAttribute(
      'aria-selected',
      'true'
    );

    fireEvent.keyDown(screen.getByTestId('row-b'), { key: 'x' });
    expect(onSelection).toHaveBeenLastCalledWith([]);
  });

  it('extends from the focused selected row and preserves selection when reversing', () => {
    const onSelection = vi.fn();
    render(<ConsumerOwnedSelection onSelection={onSelection} />);

    act(() => screen.getByTestId('row-a').focus());
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'J',
      shiftKey: true,
    });
    expect(screen.getByTestId('row-b')).toHaveFocus();
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'J',
      shiftKey: true,
    });
    expect(onSelection).toHaveBeenLastCalledWith(['a', 'b', 'c']);
    expect(screen.getByTestId('row-c')).toHaveFocus();

    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'ArrowDown',
      shiftKey: true,
    });
    expect(screen.getByTestId('row-d')).toHaveFocus();
    expect(onSelection).toHaveBeenLastCalledWith(['a', 'b', 'c', 'd']);
    const selectionCalls = onSelection.mock.calls.length;

    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'ArrowUp',
      shiftKey: true,
    });
    expect(onSelection).toHaveBeenLastCalledWith(['a', 'b', 'c', 'd']);
    expect(onSelection).toHaveBeenCalledTimes(selectionCalls);
    expect(screen.getByTestId('row-c')).toHaveFocus();
  });

  it('extends selection in grouped display order instead of interleaved source order', () => {
    const onSelection = vi.fn();
    render(<ConsumerOwnedSelection onSelection={onSelection} grouped />);
    act(() => screen.getByTestId('row-a').focus());
    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'ArrowDown',
      shiftKey: true,
    });
    expect(onSelection).toHaveBeenLastCalledWith(['a', 'c']);
    expect(screen.getByTestId('row-c')).toHaveFocus();
    expect(screen.getByTestId('row-b')).not.toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('requires controlled state before extending consumer-owned selection', () => {
    const onSelection = vi.fn();
    render(
      <ConsumerOwnedSelection
        onSelection={onSelection}
        provideSelectionState={false}
      />
    );

    act(() => screen.getByTestId('row-a').focus());
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'x' });
    expect(onSelection).toHaveBeenLastCalledWith(['a']);

    fireEvent.keyDown(document.activeElement as HTMLElement, {
      key: 'J',
      shiftKey: true,
    });
    expect(onSelection).toHaveBeenCalledTimes(1);
    expect(onSelection).toHaveBeenLastCalledWith(['a']);
    expect(screen.getByTestId('row-b')).toHaveFocus();
  });

  it('toggles TanStack selection when the table owns it', () => {
    const onRowSelectionChange = vi.fn();
    render(
      <UnifiedTable
        data={data}
        columns={columns}
        enableVirtualization={false}
        enableKeyboardNavigation
        getRowId={row => row.id}
        getRowTestId={row => `row-${row.id}`}
        rowSelection={{}}
        onRowSelectionChange={onRowSelectionChange}
      />
    );

    fireEvent.keyDown(screen.getByTestId('row-c'), { key: 'x' });
    expect(onRowSelectionChange).toHaveBeenCalledTimes(1);
    const updater = onRowSelectionChange.mock.calls[0][0];
    expect(updater({})).toEqual({ c: true });
  });

  it('leaves x alone when the table has no selection', () => {
    const onRowClick = vi.fn();
    render(
      <UnifiedTable
        data={data}
        columns={columns}
        enableVirtualization={false}
        getRowId={row => row.id}
        getRowTestId={row => `row-${row.id}`}
        onRowClick={onRowClick}
      />
    );

    const event = fireEvent.keyDown(screen.getByTestId('row-a'), { key: 'x' });
    expect(event).toBe(true);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('applies the 32px dense row geometry', () => {
    const { container } = render(
      <UnifiedTable
        data={data}
        columns={columns}
        rowMode='dense'
        enableVirtualization={false}
      />
    );

    const table = container.querySelector('table');
    expect(table).toHaveAttribute('data-table-row-mode', 'dense');
    expect(table?.style.getPropertyValue('--table-row-height')).toBe('32px');
    expect(table?.style.getPropertyValue('--table-cell-content-height')).toBe(
      '24px'
    );
  });
});
