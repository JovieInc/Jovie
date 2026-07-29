import type { Row } from '@tanstack/react-table';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VirtualizedTableRow } from '@/components/organisms/table/organisms/VirtualizedTableRow';

type TestRow = { id: string; name: string };

const createRow = (
  id: string,
  name: string,
  isSelected = false
): Row<TestRow> =>
  ({
    id,
    original: { id, name },
    getVisibleCells: () => [],
    getIsSelected: () => isSelected,
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

  it('maps TanStack row selection to shared selected row styling', () => {
    render(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            row={createRow('1', 'One', true)}
          />
        </tbody>
      </table>
    );

    const row = screen.getByRole('row');
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row.className).toContain('system-b-table-row-selected');
    expect(row.className).toContain('system-b-table-row-focus-within');
  });

  it('keeps pointer activation separate from keyboard-visible row focus', () => {
    const onRowClick = vi.fn();
    const onFocusChange = vi.fn();

    render(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            shouldEnableKeyboardNav
            onFocusChange={onFocusChange}
            onRowClick={onRowClick}
          />
        </tbody>
      </table>
    );

    const row = screen.getByRole('row');
    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledWith({ id: '1', name: 'One' });
    expect(onFocusChange).not.toHaveBeenCalled();

    const matches = vi
      .spyOn(row, 'matches')
      .mockImplementation(selector => selector === ':focus-visible');
    fireEvent.focus(row);
    expect(onFocusChange).toHaveBeenCalledWith(0);
    matches.mockRestore();
  });

  it('keeps only the roving row in the tab order', () => {
    render(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            shouldEnableKeyboardNav
            focusedIndex={1}
          />
        </tbody>
      </table>
    );

    expect(screen.getByRole('row')).toHaveAttribute('tabindex', '-1');
  });

  it('accepts consumer-owned selection when TanStack selection is unavailable', () => {
    render(
      <table>
        <tbody>
          <VirtualizedTableRow {...baseProps} isSelected />
        </tbody>
      </table>
    );

    const row = screen.getByRole('row');
    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(row).toHaveClass('system-b-table-row-selected');
  });
});
