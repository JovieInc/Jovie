import type { Header } from '@tanstack/react-table';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TableHeaderCell } from './TableHeaderCell';

type Row = { title: string };

function mockHeader(
  label: string,
  opts?: { placeholder?: boolean }
): Header<Row, unknown> {
  return {
    id: label,
    isPlaceholder: Boolean(opts?.placeholder),
    getSize: () => 160,
    column: {
      columnDef: {
        header: label,
        meta: undefined,
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
});
