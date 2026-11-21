import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ColumnDef } from '@/lib/tanstack-table';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ADMIN_DATA_TABLE_CLASSNAME, AdminDataTable } from './AdminDataTable';

type Row = { id: string; name: string };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
];

describe('AdminDataTable', () => {
  it('renders rows with the compact admin density and stays axe-clean', async () => {
    const { container } = render(
      <AdminDataTable<Row>
        columns={columns}
        data={[{ id: '1', name: 'Midnight Signal' }]}
        getRowId={row => row.id}
        enableVirtualization={false}
        className='extra-class'
      />
    );
    expect(await screen.findByText('Midnight Signal')).toBeInTheDocument();
    const classNames = ADMIN_DATA_TABLE_CLASSNAME.split(' ');
    expect(container.querySelector('.extra-class')).toHaveClass(classNames[0]);
    await expectNoA11yViolations(container);
  });

  it('renders the skeleton while loading', async () => {
    const { container } = render(
      <AdminDataTable<Row>
        columns={columns}
        data={[]}
        isLoading
        skeletonRows={3}
        enableVirtualization={false}
      />
    );
    expect(screen.queryByText('Midnight Signal')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
