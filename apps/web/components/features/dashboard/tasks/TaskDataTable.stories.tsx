import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ColumnDef } from '@/lib/tanstack-table';
import { TaskDataTable } from './TaskDataTable';

type TaskRow = { id: string; title: string; status: string };

const columns: ColumnDef<TaskRow, unknown>[] = [
  { accessorKey: 'title', header: 'Title' },
  { accessorKey: 'status', header: 'Status' },
];

const data: TaskRow[] = [
  { id: '1', title: 'Review provider mapping', status: 'Open' },
  { id: '2', title: 'Confirm release metadata', status: 'Done' },
];

const meta: Meta<typeof TaskDataTable<TaskRow>> = {
  title: 'Dashboard/Tasks/TaskDataTable',
  component: TaskDataTable,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof TaskDataTable<TaskRow>>;

export const Default: Story = {
  args: {
    columns,
    data,
    getRowId: row => row.id,
  },
};
