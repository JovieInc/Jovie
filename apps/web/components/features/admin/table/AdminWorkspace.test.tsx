import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ColumnDef } from '@/lib/tanstack-table';
import { AdminDataTable } from './AdminDataTable';
import { AdminTableShell } from './AdminTableShell';

type RecordRow = { id: string; name: string; status: string };
const columns: ColumnDef<RecordRow, unknown>[] = [
  { accessorKey: 'name', header: 'Name', size: 260 },
  {
    accessorKey: 'status',
    header: 'Status',
    size: 150,
    meta: { className: 'text-right' },
  },
];
const data = [
  { id: 'a', name: 'A very long name '.repeat(60), status: 'Missing' },
];

function widths(container: HTMLElement) {
  return [...container.querySelectorAll('col')].map(col => col.style.width);
}

describe('admin workspace composition', () => {
  it('preserves schema geometry through loading, empty, populated, and grouped states', () => {
    const props = {
      columns,
      enableVirtualization: false,
      emptyState: <p>No records</p>,
    };
    const { container, rerender } = render(
      <AdminDataTable {...props} data={[]} isLoading />
    );
    expect(widths(container)).toEqual(['260px', '150px']);
    expect(container.querySelector('tbody tr td:last-child')).toHaveClass(
      'text-right'
    );
    expect(container.querySelector('col:last-child')).toHaveClass('text-right');
    expect(screen.getByRole('table')).toHaveClass('table-fixed');
    expect(screen.getByRole('table')).toHaveAttribute(
      'data-table-row-mode',
      'compact'
    );
    rerender(<AdminDataTable {...props} data={[]} />);
    expect(screen.getByText('No records')).toBeVisible();
    expect(widths(container)).toEqual(['260px', '150px']);
    rerender(<AdminDataTable {...props} data={data} />);
    expect(widths(container)).toEqual(['260px', '150px']);
    rerender(
      <AdminDataTable
        {...props}
        data={data}
        groupingConfig={{
          getGroupKey: row => row.status,
          getGroupLabel: key => key,
        }}
      />
    );
    expect(widths(container)).toEqual(['260px', '150px']);
    rerender(
      <AdminDataTable
        {...props}
        data={data}
        columnVisibility={{ status: false }}
      />
    );
    expect(widths(container)).toEqual(['260px']);
    rerender(
      <AdminDataTable
        {...props}
        data={[]}
        isLoading
        columnVisibility={{ status: false }}
      />
    );
    expect(container.querySelector('tbody tr')?.children).toHaveLength(1);
    rerender(
      <AdminDataTable
        {...props}
        data={data}
        columnVisibility={{ status: false }}
        groupingConfig={{
          getGroupKey: row => row.status,
          getGroupLabel: key => key,
        }}
      />
    );
    expect(container.querySelector('tr[data-group-key] td')).toHaveAttribute(
      'colspan',
      '1'
    );
    expect(widths(container)).toEqual(['260px']);
  });

  it('keeps toolbar and footer outside the child scroll region and observes child scrolling', () => {
    const onKeyDown = vi.fn();
    render(
      <AdminTableShell
        toolbar={<button type='button'>Filter</button>}
        footer={<p>Pagination</p>}
        scrollContainerProps={{
          role: 'region',
          'aria-label': 'Tasks',
          onKeyDown,
          tabIndex: 0,
        }}
      >
        {({ headerElevated, stickyTopPx }) => (
          <>
            <output data-testid='sticky-offset'>{stickyTopPx}</output>
            <output data-testid='elevated'>{String(headerElevated)}</output>
            <AdminDataTable
              columns={columns}
              data={data}
              enableVirtualization={false}
            />
          </>
        )}
      </AdminTableShell>
    );
    const region = screen.getByRole('region', { name: 'Tasks' });
    expect(region).not.toContainElement(
      screen.getByRole('button', { name: 'Filter' })
    );
    expect(region).not.toContainElement(screen.getByText('Pagination'));
    expect(region).toContainElement(screen.getByRole('table'));
    expect(screen.getByTestId('sticky-offset')).toHaveTextContent('0');
    const scroller = screen.getByRole('table').parentElement!;
    expect(scroller).toHaveClass('min-h-0', 'flex-1');
    fireEvent.scroll(scroller, { target: { scrollTop: 160 } });
    expect(screen.getByTestId('elevated')).toHaveTextContent('true');
    fireEvent.scroll(scroller, { target: { scrollTop: 0 } });
    expect(screen.getByTestId('elevated')).toHaveTextContent('false');
    fireEvent.keyDown(region, { key: 'j' });
    expect(onKeyDown).toHaveBeenCalledOnce();
  });
});
