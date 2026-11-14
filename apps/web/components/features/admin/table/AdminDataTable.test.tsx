import { TooltipProvider } from '@jovie/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ColumnDef } from '@/lib/tanstack-table';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ADMIN_DATA_TABLE_CLASSNAME, AdminDataTable } from './AdminDataTable';

type Row = { id: string; name: string; status: string };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'status', header: 'Status' },
];

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra of Everywhere';

const ROWS: Row[] = [
  { id: '1', name: 'Midnight Signal', status: 'Active' },
  { id: '2', name: LONG_NAME, status: 'Pending' },
];

function renderTable(
  props: Partial<React.ComponentProps<typeof AdminDataTable<Row>>> = {},
  dir?: 'rtl'
) {
  return render(
    <TooltipProvider>
      <div dir={dir}>
        <AdminDataTable<Row>
          columns={columns}
          data={ROWS}
          getRowId={row => row.id}
          enableVirtualization={false}
          {...props}
        />
      </div>
    </TooltipProvider>
  );
}

describe('AdminDataTable', () => {
  it('renders headers and a row per record with the admin density classes', async () => {
    const { container } = renderTable();
    const table = screen.getByRole('table');
    expect(table).toHaveClass(...ADMIN_DATA_TABLE_CLASSNAME.split(' '));
    expect(
      screen.getByRole('columnheader', { name: 'Name' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Status' })
    ).toBeInTheDocument();
    expect(screen.getByText('Midnight Signal')).toBeInTheDocument();
    expect(screen.getByText(LONG_NAME)).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    await expectNoA11yViolations(container);
  });

  it('calls onRowClick with the clicked record', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderTable({ onRowClick });
    await user.click(screen.getByText('Midnight Signal'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0]?.[0]).toEqual(ROWS[0]);
  });

  it('keeps headers over skeleton rows while loading', async () => {
    const { container } = renderTable({
      data: [],
      isLoading: true,
      skeletonRows: 4,
    });
    expect(
      screen.getByRole('columnheader', { name: 'Name' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Midnight Signal')).toBeNull();
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length
    ).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('shows the caller empty state when there are no rows', async () => {
    const { container } = renderTable({
      data: [],
      emptyState: <p>No creators yet</p>,
    });
    expect(screen.getByText('No creators yet')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('applies caller class names beside the admin defaults', () => {
    renderTable({ className: 'custom-density' });
    expect(screen.getByRole('table')).toHaveClass(
      'custom-density',
      ...ADMIN_DATA_TABLE_CLASSNAME.split(' ')
    );
  });

  it('stays axe clean inside a right-to-left document', async () => {
    const { container } = renderTable(
      {
        columns: [
          { accessorKey: 'name', header: 'الاسم' },
          { accessorKey: 'status', header: 'الحالة' },
        ],
        data: [{ id: '1', name: 'ليلى الحسن', status: 'نشط' }],
      },
      'rtl'
    );
    expect(screen.getByText('ليلى الحسن')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'الاسم' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
