import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, screen } from 'storybook/test';
import { BulkDeleteCreatorDialog } from './BulkDeleteCreatorDialog';

/** State coverage for the bulk creator delete confirmation. */
const meta = {
  title: 'Features/Admin/BulkDeleteCreatorDialog',
  component: BulkDeleteCreatorDialog,
  parameters: { layout: 'centered' },
  args: {
    open: true,
    count: 3,
    onOpenChange: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof BulkDeleteCreatorDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a large selection keeps the plural title on one dialog. */
export const LongContentLargeSelection: Story = {
  args: { count: 12_480 },
  play: async () => {
    await expect(
      await screen.findByRole('alertdialog', { name: 'Delete 12480 creators?' })
    ).toBeVisible();
    await expect(
      screen.getByRole('button', { name: 'Delete Profiles' })
    ).toBeVisible();
  },
};

/** Right-to-left: the confirmation inside an RTL document. */
export const RtlDocument: Story = {
  args: { count: 1 },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async () => {
    await expect(
      await screen.findByRole('alertdialog', { name: 'Delete 1 creator?' })
    ).toBeVisible();
  },
};
