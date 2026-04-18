import type { Row } from '@tanstack/react-table';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VirtualizedTableRow } from '@/components/organisms/table/organisms/VirtualizedTableRow';

type TestRow = { id: string; name: string };

const createRow = (id: string, name: string): Row<TestRow> =>
  ({
    id,
    original: { id, name },
    getVisibleCells: () => [],
  }) as unknown as Row<TestRow>;

const baseProps = {
  row: createRow('1', 'One'),
  rowIndex: 0,
  rowRefsMap: new Map<number, HTMLTableRowElement>(),
  shouldEnableKeyboardNav: false,
  shouldVirtualize: false,
  focusedIndex: -1,
  onFocusChange: vi.fn(),
  onKeyDown: vi.fn(),
};

describe('VirtualizedTableRow', () => {
  it('forwards extra HTML props onto the <tr> element', () => {
    render(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            data-state='open'
            aria-label='test row'
          />
        </tbody>
      </table>
    );

    const row = screen.getByRole('row');
    expect(row).toHaveAttribute('data-state', 'open');
    expect(row).toHaveAttribute('aria-label', 'test row');
  });

  it('calls both the forwarded onContextMenu and the internal handler on right-click', () => {
    const forwardedContextMenu = vi.fn();
    const onRowClick = vi.fn();
    const onRowContextMenu = vi.fn();

    render(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            onRowClick={onRowClick}
            onRowContextMenu={onRowContextMenu}
            onContextMenu={forwardedContextMenu}
          />
        </tbody>
      </table>
    );

    const row = screen.getByRole('row');
    fireEvent.contextMenu(row);

    // Internal handlers should fire
    expect(onRowClick).toHaveBeenCalledWith({ id: '1', name: 'One' });
    expect(onRowContextMenu).toHaveBeenCalledWith(
      { id: '1', name: 'One' },
      expect.objectContaining({ type: 'contextmenu' })
    );

    // Forwarded handler (e.g. from Radix ContextMenu.Trigger asChild) should also fire
    expect(forwardedContextMenu).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'contextmenu' })
    );
  });

  it('handles right-click gracefully when no forwarded onContextMenu is provided', () => {
    const onRowClick = vi.fn();

    render(
      <table>
        <tbody>
          <VirtualizedTableRow {...baseProps} onRowClick={onRowClick} />
        </tbody>
      </table>
    );

    const row = screen.getByRole('row');
    // Should not throw
    fireEvent.contextMenu(row);
    expect(onRowClick).toHaveBeenCalled();
  });
});
