import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { TableBadge } from './TableBadge';

/** State coverage for the table status badge. */
const meta = {
  title: 'Organisms/Table/Atoms/TableBadge States',
  component: TableBadge,
  parameters: {
    layout: 'centered',
  },
  args: {
    children: 'Active',
    variant: 'secondary',
  },
} satisfies Meta<typeof TableBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the error variant used for failed rows. */
export const ErrorVariant: Story = {
  args: {
    children: 'Failed',
    variant: 'error',
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Failed')).toBeVisible();
  },
};

/** Partial: only the required props, so size falls back to sm. */
export const PartialDefaults: Story = {
  args: {
    children: 'Draft',
    variant: 'primary',
  },
};

/** Long content: a long label wraps inside a narrow cell. */
export const LongContentLabel: Story = {
  args: {
    children: 'Awaiting distributor review before scheduled release',
    variant: 'warning',
  },
  decorators: [
    function NarrowCell(Story) {
      return (
        <div className='w-32'>
          <Story />
        </div>
      );
    },
  ],
};

/** Right-to-left: an Arabic label inside an RTL document. */
export const RtlLabel: Story = {
  args: {
    children: 'نشط',
    variant: 'success',
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
