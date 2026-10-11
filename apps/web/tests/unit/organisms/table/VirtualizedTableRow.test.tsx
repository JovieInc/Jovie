import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColumnCompactProvider } from '@/components/organisms/table/column-priority-context';
import { VirtualizedTableRow } from '@/components/organisms/table/organisms/VirtualizedTableRow';
import type { Row } from '@/lib/tanstack-table';

type TestRow = { id: string; name: string };

const createRow = (
  id: string,
  name: string,
  isSelected = false,
  actionVisibility?: 'always' | 'contextual',
  meta?: {
    align?: 'left' | 'center' | 'right';
    className?: string;
    cellContentClassName?: string;
  },
  cellSize = 150
): Row<TestRow> =>
  ({
    id,
    original: { id, name },
    getVisibleCells: () =>
      actionVisibility || meta
        ? [
            {
              id: `${id}-actions`,
              column: {
                getSize: () => cellSize,
                columnDef: {
                  meta: { actionVisibility, ...meta },
                  cell: () =>
                    actionVisibility ? (
                      <button type='button'>More</button>
                    ) : (
                      name
                    ),
                },
              },
              getContext: () => ({}),
            },
          ]
        : [],
    getIsSelected: () => isSelected,
  }) as unknown as Row<TestRow>;

const baseProps = {
  row: createRow('1', 'One'),
  rowIndex: 0,
  rowRefsMap: new Map<number, HTMLTableRowElement>(),
  shouldEnableKeyboardNav: false,
  shouldVirtualize: false,
  isFocused: false,
  onFocusChange: vi.fn(),
  onKeyDown: vi.fn(),
};

describe('VirtualizedTableRow', () => {
  it('renders a fresh visible-cell snapshot without replacing the row', () => {
    const row = createRow('1', 'One', false, undefined, {});
    const visibleCells = row.getVisibleCells();
    const view = (cells: typeof visibleCells) => (
      <table>
        <tbody>
          <VirtualizedTableRow {...baseProps} row={row} visibleCells={cells} />
        </tbody>
      </table>
    );
    const { rerender } = render(view(visibleCells));
    expect(screen.getByRole('cell')).toHaveTextContent('One');
    rerender(view([]));
    expect(screen.queryByRole('cell')).not.toBeInTheDocument();
    rerender(view(visibleCells));
    expect(screen.getByRole('cell')).toHaveTextContent('One');
  });

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

  it('lays virtualized rows out on the declared column grid', () => {
    // Virtualized rows stay in normal table flow so their cells share the
    // table's column widths; non-default column sizes are pinned explicitly
    // so every row matches the header's grid.
    const row = createRow('1', 'One', false, undefined, {}, 240);

    render(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            row={row}
            shouldVirtualize
            measureElement={vi.fn()}
          />
        </tbody>
      </table>
    );

    const tr = screen.getByRole('row');
    expect(tr.style.position).toBe('');
    expect(screen.getByRole('cell').style.width).toBe('240px');
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
            isFocused={false}
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

  it('marks contextual action cells without changing row geometry', () => {
    render(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            row={createRow('1', 'One', false, 'contextual')}
          />
        </tbody>
      </table>
    );

    const row = screen.getByRole('row');
    const actionCell = screen
      .getByRole('button', { name: 'More' })
      .closest('td');
    expect(row).toHaveClass('system-b-table-row-height');
    expect(actionCell).toHaveClass('system-b-table-contextual-action-cell');
    expect(
      actionCell?.querySelector('[data-table-cell-content="stable"]')
    ).toHaveClass('h-8', 'max-h-8', 'overflow-hidden');
  });

  it('keeps the default single-line cell content unless a column opts in', () => {
    render(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            row={createRow('1', 'One', false, undefined, {})}
          />
        </tbody>
      </table>
    );

    expect(
      screen
        .getByRole('cell')
        .querySelector('[data-table-cell-content="stable"]')
    ).toHaveClass('h-8', 'max-h-8', 'overflow-hidden', 'whitespace-nowrap');
  });

  it('lets a column opt into wrapping without changing the shared default', () => {
    render(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            row={createRow('1', 'One', false, undefined, {
              cellContentClassName:
                'h-auto max-h-none overflow-visible text-clip whitespace-normal leading-normal',
            })}
          />
        </tbody>
      </table>
    );

    const content = screen
      .getByRole('cell')
      .querySelector('[data-table-cell-content="stable"]');
    expect(content).toHaveClass(
      'h-auto',
      'max-h-none',
      'overflow-visible',
      'text-clip',
      'whitespace-normal',
      'leading-normal'
    );
    expect(content).not.toHaveClass(
      'h-8',
      'max-h-8',
      'overflow-hidden',
      'text-ellipsis',
      'whitespace-nowrap',
      'leading-8'
    );
  });

  it('applies column meta alignment to rendered cells', () => {
    render(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            row={createRow('1', 'One', false, undefined, { align: 'right' })}
          />
        </tbody>
      </table>
    );

    expect(screen.getByRole('cell')).toHaveClass('text-right');
  });

  it('lets column meta classes override the canonical cell tone', () => {
    render(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            row={createRow('1', 'One', false, undefined, {
              className: 'text-secondary-token',
            })}
          />
        </tbody>
      </table>
    );

    const cell = screen.getByRole('cell');
    expect(cell).toHaveClass('text-secondary-token');
    expect(cell).not.toHaveClass('text-primary-token');
  });

  it('keeps virtualized rows in normal table flow for WebKit', () => {
    // Absolutely positioned rows need <tbody> as their containing block, and
    // WebKit never makes a table row group one. In Safari they escaped to the
    // page origin and painted over the page chrome.
    render(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            shouldVirtualize
            measureElement={vi.fn()}
          />
        </tbody>
      </table>
    );

    const row = screen.getByRole('row');
    expect(row.style.position).toBe('');
    expect(row.style.transform).toBe('');
  });

  it('folds hidden-column compact forms into the primary cell', () => {
    const row = {
      id: '1',
      original: { id: '1', name: 'Avery Chen' },
      getVisibleCells: () => [
        {
          id: '1-fan',
          column: {
            id: 'fan',
            getSize: () => 400,
            columnDef: {
              meta: { primary: true },
              cell: () => 'Avery Chen',
            },
          },
          getContext: () => ({}),
        },
      ],
      getIsSelected: () => false,
    } as unknown as Row<TestRow>;

    render(
      <ColumnCompactProvider
        value={{
          primaryId: 'fan',
          items: [{ id: 'state', render: () => 'Active' }],
        }}
      >
        <table>
          <tbody>
            <VirtualizedTableRow
              {...baseProps}
              row={row}
              visibleCells={row.getVisibleCells()}
            />
          </tbody>
        </table>
      </ColumnCompactProvider>
    );

    expect(screen.getByRole('cell')).toHaveTextContent('Avery Chen');
    expect(screen.getByTestId('table-column-compacts')).toHaveTextContent(
      'Active'
    );
  });

  it('keeps cells static unless the table asks for a column snap', () => {
    const row = {
      id: '1',
      original: { id: '1', name: 'Avery Chen' },
      getVisibleCells: () => [
        {
          id: '1-fan',
          column: {
            id: 'fan',
            getSize: () => 400,
            columnDef: { cell: () => 'Avery Chen' },
          },
          getContext: () => ({}),
        },
      ],
      getIsSelected: () => false,
    } as unknown as Row<TestRow>;

    const { rerender } = render(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            row={row}
            visibleCells={row.getVisibleCells()}
          />
        </tbody>
      </table>
    );
    expect(screen.getByRole('cell')).not.toHaveAttribute('data-column-snap');

    rerender(
      <table>
        <tbody>
          <VirtualizedTableRow
            {...baseProps}
            row={row}
            rowIndex={3}
            visibleCells={row.getVisibleCells()}
            columnSnap
            columnSnapOrder={3}
          />
        </tbody>
      </table>
    );
    expect(screen.getByRole('cell')).toHaveAttribute('data-column-snap', 'on');
    expect(screen.getByRole('cell')).toHaveAttribute(
      'data-column-snap-order',
      '3'
    );
  });
});
