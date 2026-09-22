import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ColumnDef } from '@/lib/tanstack-table';
import { AdminDataTable } from './AdminDataTable';

type Row = { id: string; name: string; status: string };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'status', header: 'Status' },
];

const data: Row[] = [
  { id: '1', name: 'Midnight Signal', status: 'Active' },
  { id: '2', name: 'Neon Rivers', status: 'Pending' },
];

const meta: Meta<typeof AdminDataTable<Row>> = {
  title: 'Admin/Tables/AdminDataTable',
  component: AdminDataTable,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof AdminDataTable<Row>>;

export const Default: Story = {
  args: {
    columns,
    data,
    getRowId: row => row.id,
  },
};

export const Loading: Story = {
  args: {
    columns,
    data: [],
    isLoading: true,
    skeletonRows: 5,
  },
};
