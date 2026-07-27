import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  TASK_DATA_TABLE_CLASSNAME,
  TASK_DATA_TABLE_CONTAINER_CLASSNAME,
  TASK_DATA_TABLE_ROW_CLASSNAME,
  TaskDataTable,
} from '@/components/features/dashboard/tasks/TaskDataTable';

vi.mock('@/components/organisms/table', () => ({
  UnifiedTable: ({
    className,
    containerClassName,
    enableVirtualization,
    getRowClassName,
    hideHeader,
    minWidth,
    rowHeight,
    skeletonRows,
  }: {
    readonly className?: string;
    readonly containerClassName?: string;
    readonly enableVirtualization?: boolean;
    readonly getRowClassName?: (
      row: { readonly id: string },
      index: number
    ) => string;
    readonly hideHeader?: boolean;
    readonly minWidth?: string;
    readonly rowHeight?: number;
    readonly skeletonRows?: number;
  }) => (
    <div
      data-class-name={className}
      data-container-class-name={containerClassName}
      data-hide-header={String(hideHeader)}
      data-min-width={minWidth}
      data-row-class-name={getRowClassName?.({ id: 'task-1' }, 0)}
      data-row-height={String(rowHeight)}
      data-skeleton-rows={String(skeletonRows)}
      data-testid='unified-table'
      data-virtualized={String(enableVirtualization)}
    />
  ),
}));

describe('TaskDataTable', () => {
  it('applies canonical task list geometry and density defaults', () => {
    render(<TaskDataTable columns={[]} data={[]} />);

    const table = screen.getByTestId('unified-table');

    expect(table).toHaveAttribute('data-class-name', TASK_DATA_TABLE_CLASSNAME);
    expect(table).toHaveAttribute(
      'data-container-class-name',
      TASK_DATA_TABLE_CONTAINER_CLASSNAME
    );
    expect(table).toHaveAttribute('data-hide-header', 'true');
    expect(table).toHaveAttribute('data-min-width', '100%');
    expect(table).toHaveAttribute(
      'data-row-class-name',
      TASK_DATA_TABLE_ROW_CLASSNAME
    );
    expect(table).toHaveAttribute('data-row-height', '56');
    expect(table).toHaveAttribute('data-skeleton-rows', '8');
    expect(table).toHaveAttribute('data-virtualized', 'false');
  });

  it('allows callers to extend task table chrome without losing row defaults', () => {
    render(
      <TaskDataTable
        className='custom-density'
        columns={[]}
        containerClassName='custom-scroll'
        data={[]}
        getRowClassName={() => 'selected-row'}
        rowHeight={72}
      />
    );

    const table = screen.getByTestId('unified-table');

    expect(table).toHaveAttribute(
      'data-class-name',
      `${TASK_DATA_TABLE_CLASSNAME} custom-density`
    );
    expect(table).toHaveAttribute(
      'data-container-class-name',
      `${TASK_DATA_TABLE_CONTAINER_CLASSNAME} custom-scroll`
    );
    expect(table).toHaveAttribute(
      'data-row-class-name',
      `${TASK_DATA_TABLE_ROW_CLASSNAME} selected-row`
    );
    expect(table).toHaveAttribute('data-row-height', '72');
  });
});
