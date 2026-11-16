import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { TableHeaderRow } from './TableHeaderRow';

/** State coverage for the table header row, rendered inside a table head. */
const meta = {
  title: 'Organisms/Table/TableHeaderRow States',
  component: TableHeaderRow,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof TableHeaderRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a single heading and no sticky offset. */
export const PartialSingleHeading: Story = {
  args: { children: null },
  render: function PartialSingleHeadingStory() {
    return (
      <table>
        <thead>
          <TableHeaderRow>
            <th scope='col'>Name</th>
          </TableHeaderRow>
        </thead>
      </table>
    );
  },
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByRole('row');
    await expect(row).not.toHaveAttribute('style');
  },
};

/** Long content: many long headings in a constrained table. */
export const LongContentHeadings: Story = {
  args: { children: null },
  render: function LongContentHeadingsStory() {
    return (
      <table className='w-96 table-fixed'>
        <thead>
          <TableHeaderRow>
            <th scope='col'>Release title and primary artist</th>
            <th scope='col'>Distribution delivery status</th>
            <th scope='col'>Most recent provider confirmation</th>
            <th scope='col'>Lifetime streams across platforms</th>
          </TableHeaderRow>
        </thead>
      </table>
    );
  },
};

/** Right-to-left: Arabic headings in an RTL table. */
export const RtlHeadings: Story = {
  args: { children: null },
  render: function RtlHeadingsStory() {
    return (
      <table dir='rtl'>
        <thead>
          <TableHeaderRow stickyOffset={40}>
            <th scope='col'>الاسم</th>
            <th scope='col'>الحالة</th>
            <th scope='col'>المبلغ</th>
          </TableHeaderRow>
        </thead>
      </table>
    );
  },
};
