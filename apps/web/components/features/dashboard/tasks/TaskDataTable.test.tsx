import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TooltipProvider } from '@jovie/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ColumnDef } from '@/lib/tanstack-table';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  TASK_DATA_TABLE_CLASSNAME,
  TASK_DATA_TABLE_ROW_CLASSNAME,
  TaskDataTable,
} from './TaskDataTable';

type TaskRow = { id: string; title: string; status: string };

const columns: ColumnDef<TaskRow, unknown>[] = [
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'status', header: 'Status' },
];

const data: TaskRow[] = [
  { id: 'task-1', title: 'Review provider mapping', status: 'Open' },
  { id: 'task-2', title: 'Confirm release metadata', status: 'Done' },
];

describe('TaskDataTable certificate', () => {
  it('renders task rows with the task row classes and no visible header', async () => {
    const { container } = render(
      <TooltipProvider>
        <TaskDataTable
          columns={columns}
          data={data}
          getRowId={row => row.id}
          getRowClassName={row => `task-${row.status.toLowerCase()}`}
          caption='Tasks'
        />
      </TooltipProvider>
    );

    const table = screen.getByRole('table');
    expect(table).toHaveClass(TASK_DATA_TABLE_CLASSNAME);
    expect(table).toHaveAttribute('data-table-row-mode', 'compact');
    const first = screen.getByText('Review provider mapping').closest('tr');
    const second = screen.getByText('Confirm release metadata').closest('tr');
    for (const className of TASK_DATA_TABLE_ROW_CLASSNAME.split(' ')) {
      expect(first).toHaveClass(className);
      expect(second).toHaveClass(className);
    }
    expect(first).toHaveClass('task-open');
    expect(second).toHaveClass('task-done');
    expect(within(second as HTMLElement).getByText('Done')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('passes row clicks through to the caller', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    render(
      <TooltipProvider>
        <TaskDataTable
          columns={columns}
          data={data}
          getRowId={row => row.id}
          onRowClick={onRowClick}
        />
      </TooltipProvider>
    );

    await user.click(screen.getByText('Confirm release metadata'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(data[1]);
  });

  it('shows the caller empty state when there are no tasks', async () => {
    const { container } = render(
      <TooltipProvider>
        <TaskDataTable
          columns={columns}
          data={[]}
          emptyState={<p>No tasks yet</p>}
        />
      </TooltipProvider>
    );

    expect(screen.getByText('No tasks yet')).toBeInTheDocument();
    expect(screen.queryByText('Review provider mapping')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('shows skeleton rows instead of data while loading, eight by default', async () => {
    const { container, rerender } = render(
      <TooltipProvider>
        <TaskDataTable
          columns={columns}
          data={data}
          isLoading
          skeletonRows={3}
        />
      </TooltipProvider>
    );

    expect(screen.queryByText('Review provider mapping')).toBeNull();
    const withThree = container.querySelectorAll('tbody tr').length;
    expect(withThree).toBeGreaterThanOrEqual(3);
    expect(withThree).toBeLessThan(8);
    await expectNoA11yViolations(container);

    rerender(
      <TooltipProvider>
        <TaskDataTable columns={columns} data={data} isLoading />
      </TooltipProvider>
    );
    expect(container.querySelectorAll('tbody tr')).toHaveLength(8);
  });
});

describe('TaskDataTable seam', () => {
  it('puts its content on the 12px workspace seam (JOV-12565)', () => {
    const source = readFileSync(
      resolve(__dirname, './TaskDataTable.tsx'),
      'utf8'
    );

    expect(source).toContain(
      "'h-full overflow-y-auto overflow-x-hidden pb-2 pt-0.5'"
    );
    expect(source).not.toContain('px-2.5 pb-2');
  });
});
