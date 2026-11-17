import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { TableCountBadge } from './TableCountBadge';

/** State coverage for the toolbar count badge. */
const meta = {
  title: 'Organisms/Table/Atoms/TableCountBadge States',
  component: TableCountBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    totalCount: 128,
  },
} satisfies Meta<typeof TableCountBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a table with no rows reads "0 total". */
export const EmptyTable: Story = {
  args: {
    totalCount: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('0 total')).toBeVisible();
  },
};

/** Partial: no selection count passed, so the total shows. */
export const PartialTotalOnly: Story = {
  args: {
    variant: 'text',
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('128 total')).toBeVisible();
  },
};

/** Long content: a seven-digit selection count. */
export const LongContentCount: Story = {
  args: {
    selectedCount: 1_284_903,
    totalCount: 2_000_000,
  },
};

/** Right-to-left: the badge inside an RTL document. */
export const RtlCount: Story = {
  args: {
    selectedCount: 5,
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
