import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_DATA_TABLE_CLASSNAME,
  AdminDataTable,
} from '@/features/admin/table/AdminDataTable';

vi.mock('@/components/organisms/table', () => ({
  UnifiedTable: ({
    className,
    enableVirtualization,
    minWidth,
  }: {
    readonly className?: string;
    readonly enableVirtualization?: boolean;
    readonly minWidth?: string;
  }) => (
    <div
      data-class-name={className}
      data-min-width={minWidth}
      data-testid='unified-table'
      data-virtualized={String(enableVirtualization)}
    />
  ),
}));

describe('AdminDataTable', () => {
  it('applies canonical admin table density and virtualization defaults', () => {
    render(<AdminDataTable columns={[]} data={[]} />);

    const table = screen.getByTestId('unified-table');

    expect(table).toHaveAttribute(
      'data-class-name',
      ADMIN_DATA_TABLE_CLASSNAME
    );
    expect(table).toHaveAttribute('data-min-width', '960px');
    expect(table).toHaveAttribute('data-virtualized', 'true');
  });

  it('allows callers to extend class names and override table geometry', () => {
    render(
      <AdminDataTable
        className='custom-density'
        columns={[]}
        data={[]}
        enableVirtualization={false}
        minWidth='1120px'
      />
    );

    const table = screen.getByTestId('unified-table');

    expect(table).toHaveAttribute(
      'data-class-name',
      `${ADMIN_DATA_TABLE_CLASSNAME} custom-density`
    );
    expect(table).toHaveAttribute('data-min-width', '1120px');
    expect(table).toHaveAttribute('data-virtualized', 'false');
  });
});
