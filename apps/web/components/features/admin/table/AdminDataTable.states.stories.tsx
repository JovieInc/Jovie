import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ColumnDef } from '@/lib/tanstack-table';
import { AdminDataTable } from './AdminDataTable';

type Row = { id: string; name: string; status: string };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'status', header: 'Status' },
];

const meta: Meta<typeof AdminDataTable<Row>> = {
  title: 'Admin/Tables/AdminDataTable/States',
  component: AdminDataTable,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof AdminDataTable<Row>>;

/** Long content: a name far wider than its column. */
export const LongContentName: Story = {
  args: {
    columns,
    data: [
      {
        id: '1',
        name: 'A release title that is far longer than the column it sits in and keeps going to prove truncation',
        status: 'Active',
      },
    ],
    getRowId: row => row.id,
  },
};

/** Rtl: the table inside a right-to-left container. */
export const RtlTable: Story = {
  args: {
    columns,
    data: [{ id: '1', name: 'إشارة منتصف الليل', status: 'نشط' }],
    getRowId: row => row.id,
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
