import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { TableHeaderCell } from './TableHeaderCell';

/** State coverage for the table header cell, rendered inside a table head. */
const meta = {
  title: 'Organisms/Table/Atoms/TableHeaderCell States',
  component: TableHeaderCell,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof TableHeaderCell>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: sortable without a sort handler falls back to a plain label. */
export const PartialSortableWithoutHandler: Story = {
  args: { children: 'Release Date' },
  render: function PartialSortableStory() {
    return (
      <table>
        <thead>
          <tr>
            <TableHeaderCell sortable>Release Date</TableHeaderCell>
          </tr>
        </thead>
      </table>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Release Date')).toBeVisible();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/** Long content: a long heading clamps to one line in a fixed width. */
export const LongContentHeading: Story = {
  args: { children: 'Long heading' },
  render: function LongContentHeadingStory() {
    return (
      <table className='w-48 table-fixed'>
        <thead>
          <tr>
            <TableHeaderCell width='w-48'>
              Most recent distribution delivery date across every provider
            </TableHeaderCell>
          </tr>
        </thead>
      </table>
    );
  },
};

/** Right-to-left: sortable Arabic headings in an RTL table. */
export const RtlHeadings: Story = {
  args: { children: 'العنوان' },
  render: function RtlHeadingsStory() {
    return (
      <table dir='rtl'>
        <thead>
          <tr>
            <TableHeaderCell>العنوان</TableHeaderCell>
            <TableHeaderCell
              sortable
              sortDirection='desc'
              onSort={() => undefined}
            >
              تاريخ الإصدار
            </TableHeaderCell>
          </tr>
        </thead>
      </table>
    );
  },
};
