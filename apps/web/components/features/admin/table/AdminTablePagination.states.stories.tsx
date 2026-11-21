import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AdminTablePagination } from './AdminTablePagination';

const meta = {
  title: 'Features/Admin/Table/AdminTablePagination/States',
  component: AdminTablePagination,
  parameters: { layout: 'fullscreen' },
  args: {
    page: 1,
    totalPages: 1,
    canPrev: false,
    canNext: false,
    onPrevClick: fn(),
    onNextClick: fn(),
  },
} satisfies Meta<typeof AdminTablePagination>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a table with no rows still shows page 1 of 1 and disabled controls. */
export const EmptyNoRows: Story = {
  args: { from: 0, to: 0, total: 0, entityLabel: 'creators' },
};

/** Partial: only the page count, with no range or page-size selector. */
export const PartialPageCountOnly: Story = {
  args: { page: 2, totalPages: 5, canPrev: true, canNext: true },
};

/** Long content: six-figure totals and a long entity label. */
export const LongContentLargeTotals: Story = {
  args: {
    page: 1204,
    totalPages: 20000,
    from: 120301,
    to: 120400,
    total: 1999999,
    entityLabel: 'outbound prospects awaiting review',
    canPrev: true,
    canNext: true,
    pageSize: 100,
    onPageSizeChange: fn(),
    pageSizeOptions: [50, 100, 200],
  },
};

/** Right-to-left: the controls mirror inside an RTL document. */
export const RtlControls: Story = {
  args: { page: 2, totalPages: 5, canPrev: true, canNext: true },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
