import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect, within } from 'storybook/test';
import type { ColumnDef } from '@/lib/tanstack-table';
import { AdminDataTable } from './AdminDataTable';

type Row = { id: string; name: string; status: string };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'status', header: 'Status' },
];

const LONG_NAME =
  'Aurelia Montgomery-Fitzgerald and the Extraordinarily Long Named Midnight Orchestra of Everywhere';

function RtlDecorator(Story: () => ReactNode) {
  return (
    <div dir='rtl'>
      <Story />
    </div>
  );
}

/** State coverage for the admin table wrapper: long cells and RTL. */
const meta: Meta<typeof AdminDataTable<Row>> = {
  title: 'Admin/Tables/AdminDataTable States',
  component: AdminDataTable,
  parameters: { layout: 'fullscreen' },
  args: {
    columns,
    getRowId: row => row.id,
    enableVirtualization: false,
  },
};

export default meta;
type Story = StoryObj<typeof AdminDataTable<Row>>;

/** Long content: a long cell value and many rows inside the table. */
export const LongContentRows: Story = {
  args: {
    data: [
      {
        id: 'long',
        name: LONG_NAME,
        status: 'Waiting on a second fact review before outreach',
      },
      ...Array.from({ length: 14 }, (_, index) => ({
        id: `row-${index}`,
        name: `Artist ${index + 1}`,
        status: 'Active',
      })),
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_NAME)).toBeVisible();
    await expect(canvas.getByText('Artist 14')).toBeInTheDocument();
  },
};

/** Right-to-left: columns start from the right edge of an RTL document. */
export const RtlRows: Story = {
  args: {
    columns: [
      { accessorKey: 'name', header: 'الاسم' },
      { accessorKey: 'status', header: 'الحالة' },
    ],
    data: [
      { id: '1', name: 'ليلى الحسن', status: 'نشط' },
      { id: '2', name: 'أنهار النيون', status: 'قيد الانتظار' },
    ],
  },
  decorators: [RtlDecorator],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('ليلى الحسن')).toBeVisible();
    await expect(
      canvas.getByRole('columnheader', { name: 'الاسم' })
    ).toBeVisible();
  },
};
