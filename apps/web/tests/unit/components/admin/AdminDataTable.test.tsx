import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_DATA_TABLE_CLASSNAME,
  AdminDataTable,
} from '@/components/features/admin/table/AdminDataTable';

vi.mock('@/components/organisms/table', () => ({
  UnifiedTable: ({
    className,
    columnSizing,
    containerClassName,
    enableVirtualization,
    minWidth,
    columnSnap,
    rowHeight,
    rowMode,
  }: {
    readonly className?: string;
    readonly columnSizing?: string;
    readonly containerClassName?: string;
    readonly enableVirtualization?: boolean;
    readonly minWidth?: string;
    readonly columnSnap?: boolean;
    readonly rowHeight?: number;
    readonly rowMode?: string;
  }) => (
    <div
      data-class-name={className}
      data-column-sizing={columnSizing}
      data-column-snap={String(columnSnap)}
      data-container-class-name={containerClassName}
      data-min-width={minWidth}
      data-row-height={rowHeight === undefined ? '' : String(rowHeight)}
      data-row-mode={rowMode ?? ''}
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
    expect(table).toHaveAttribute('data-column-snap', 'false');
    expect(table).toHaveAttribute('data-column-sizing', 'schema');
    expect(table).toHaveAttribute('data-row-mode', 'compact');
    expect(table).toHaveAttribute('data-row-height', '');
    expect(table).toHaveAttribute(
      'data-container-class-name',
      'min-h-0 flex-1'
    );
  });

  it('allows callers to extend class names and override table geometry', () => {
    render(
      <AdminDataTable
        className='custom-density'
        columns={[]}
        data={[]}
        containerClassName='max-h-96'
        enableVirtualization={false}
        minWidth='1120px'
        rowHeight={40}
      />
    );

    const table = screen.getByTestId('unified-table');

    expect(table).toHaveAttribute(
      'data-class-name',
      `${ADMIN_DATA_TABLE_CLASSNAME} custom-density`
    );
    expect(table).toHaveAttribute('data-min-width', '1120px');
    expect(table).toHaveAttribute('data-virtualized', 'false');
    expect(table).toHaveAttribute('data-column-sizing', 'schema');
    expect(table).toHaveAttribute('data-row-mode', '');
    expect(table).toHaveAttribute('data-row-height', '40');
    expect(table).toHaveAttribute(
      'data-container-class-name',
      'min-h-0 flex-1 max-h-96'
    );
  });
});
