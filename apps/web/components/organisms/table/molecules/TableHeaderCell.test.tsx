import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Header } from '@/lib/tanstack-table';
import { TableHeaderCell } from './TableHeaderCell';

type Row = { title: string };

function mockHeader(
  label: string,
  opts?: {
    placeholder?: boolean;
    align?: 'left' | 'center' | 'right';
    className?: string;
  }
): Header<Row, unknown> {
  return {
    id: label,
    isPlaceholder: Boolean(opts?.placeholder),
    getSize: () => 160,
    column: {
      columnDef: {
        header: label,
        meta:
          opts?.align || opts?.className
            ? { align: opts.align, className: opts.className }
            : undefined,
      },
      getCanSort: () => true,
      getIsSorted: () => false,
      getToggleSortingHandler: () => () => undefined,
    },
    getContext: () => ({}),
  } as unknown as Header<Row, unknown>;
}

function renderCell(
  props: Partial<React.ComponentProps<typeof TableHeaderCell<Row>>> = {}
) {
  return render(
    <table>
      <thead>
        <tr>
          <TableHeaderCell
            header={mockHeader('Title')}
            canSort
            sortDirection={false}
            stickyHeaderClass='sticky'
            tableHeaderClass='th'
            onToggleSort={vi.fn()}
            {...props}
          />
        </tr>
      </thead>
    </table>
  );
}

describe('TableHeaderCell (molecule)', () => {
  it('snaps the header cell only when the table asks for it', () => {
    const { rerender } = renderCell();
    expect(screen.getByRole('columnheader')).not.toHaveAttribute(
      'data-column-snap'
    );

    rerender(
      <table>
        <thead>
          <tr>
            <TableHeaderCell
              header={mockHeader('Title')}
              canSort
              sortDirection={false}
              stickyHeaderClass='sticky'
              tableHeaderClass='th'
              onToggleSort={vi.fn()}
              columnSnap
            />
          </tr>
        </thead>
      </table>
    );
    expect(screen.getByRole('columnheader')).toHaveAttribute(
      'data-column-snap',
      'on'
    );
  });

  it('renders sortable header as a button', () => {
    renderCell({ canSort: true });
    expect(screen.getByRole('button', { name: /Title/i })).toBeInTheDocument();
  });

  it('renders plain label when not sortable', () => {
    renderCell({ canSort: false, onToggleSort: undefined });
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('invokes onToggleSort when sort button is clicked', () => {
    const onToggleSort = vi.fn();
    renderCell({ onToggleSort });
    fireEvent.click(screen.getByRole('button', { name: /Title/i }));
    expect(onToggleSort).toHaveBeenCalled();
  });

  it('announces not-sorted state in the sort button accessible name', () => {
    renderCell({ sortDirection: false });
    expect(
      screen.getByRole('button', {
        name: /Title: not sorted, activate to sort/i,
      })
    ).toBeInTheDocument();
  });

  it('announces the sort direction in the sort button accessible name', () => {
    renderCell({ sortDirection: 'asc' });
    expect(
      screen.getByRole('button', { name: /Title: sorted ascending/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader')).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
  });

  it('updates the announced direction when sort toggles to descending', () => {
    renderCell({ sortDirection: 'desc' });
    expect(
      screen.getByRole('button', { name: /Title: sorted descending/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('columnheader')).toHaveAttribute(
      'aria-sort',
      'descending'
    );
  });

  it('applies column meta alignment to sortable header chrome', () => {
    renderCell({ header: mockHeader('Total', { align: 'right' }) });

    const button = screen.getByRole('button', { name: /Total/i });
    expect(screen.getByRole('columnheader')).toHaveClass('text-right');
    expect(button).toHaveClass('justify-end', 'text-right');
  });

  it('lets column meta classes override the canonical header tone', () => {
    renderCell({
      header: mockHeader('Status', { className: 'text-primary-token' }),
      canSort: false,
    });

    const header = screen.getByRole('columnheader');
    expect(header).toHaveClass('text-primary-token');
    expect(header).not.toHaveClass('text-secondary-token');
  });

  it('insets sortable cells so the pill label aligns with body cell text', () => {
    const { container } = renderCell({ canSort: true });
    expect(container.querySelector('th')).toHaveClass('px-1.5');
  });

  it('does not inset non-sortable cells', () => {
    const { container } = renderCell({ canSort: false });
    expect(container.querySelector('th')).not.toHaveClass('px-1.5');
  });

  it('keeps column heading cells bounded to one line', () => {
    const { container } = renderCell();
    expect(container.querySelector('th')).toHaveClass('whitespace-nowrap');
  });
});
