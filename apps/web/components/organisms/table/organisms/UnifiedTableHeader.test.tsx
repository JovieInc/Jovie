import {
  createColumnHelper,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UnifiedTableHeader } from './UnifiedTableHeader';

type Row = { id: string; title: string; count: number };

const columnHelper = createColumnHelper<Row>();

function Harness({
  onSortChange,
  initialSort,
}: {
  onSortChange?: () => void;
  initialSort?: { id: string; desc: boolean }[];
}) {
  const columns = [
    columnHelper.accessor('title', {
      header: 'Title',
      enableSorting: true,
    }),
    columnHelper.accessor('count', {
      header: 'Count',
      enableSorting: true,
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
    }),
  ];

  const table = useReactTable({
    data: [
      { id: '1', title: 'Alpha', count: 2 },
      { id: '2', title: 'Beta', count: 1 },
    ],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: initialSort ? { sorting: initialSort } : undefined,
    onSortingChange: onSortChange,
  });

  return (
    <table>
      <UnifiedTableHeader
        headerGroups={table.getHeaderGroups()}
        caption='Test table'
      />
    </table>
  );
}

describe('UnifiedTableHeader', () => {
  it('renders one column header per column definition', () => {
    render(<Harness />);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders a screen reader caption when provided', () => {
    render(<Harness />);
    expect(screen.getByText('Test table')).toBeInTheDocument();
  });

  it('renders sortable columns as buttons', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /Title/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Count/ })).toBeInTheDocument();
  });

  it('does not render a button for non-sortable columns', () => {
    render(<Harness />);
    expect(
      screen.queryByRole('button', { name: /Actions/ })
    ).not.toBeInTheDocument();
  });

  it('fires the sort handler when a sortable header is clicked', () => {
    const onSortChange = vi.fn();
    render(<Harness onSortChange={onSortChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Title/ }));
    expect(onSortChange).toHaveBeenCalled();
  });

  it('exposes aria-sort=ascending when sorted asc', () => {
    render(<Harness initialSort={[{ id: 'title', desc: false }]} />);
    const titleHeader = screen
      .getByRole('button', { name: /Title/ })
      .closest('th');
    expect(titleHeader).toHaveAttribute('aria-sort', 'ascending');
  });

  it('exposes aria-sort=descending when sorted desc', () => {
    render(<Harness initialSort={[{ id: 'title', desc: true }]} />);
    const titleHeader = screen
      .getByRole('button', { name: /Title/ })
      .closest('th');
    expect(titleHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('exposes aria-sort=none on sortable but unsorted columns', () => {
    render(<Harness />);
    const countHeader = screen
      .getByRole('button', { name: /Count/ })
      .closest('th');
    expect(countHeader).toHaveAttribute('aria-sort', 'none');
  });

  it('omits aria-sort on non-sortable columns', () => {
    render(<Harness />);
    const actionsHeader = screen.getByText('Actions').closest('th');
    expect(actionsHeader).not.toHaveAttribute('aria-sort');
  });

  it('returns null when headerGroups is empty', () => {
    const { container } = render(
      <table>
        <UnifiedTableHeader headerGroups={[]} />
      </table>
    );
    expect(container.querySelector('thead')).toBeNull();
  });
});
