import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Archive, Trash2 } from 'lucide-react';
import { expect, fn, within } from 'storybook/test';
import { HeaderBulkActions } from './HeaderBulkActions';

/** State coverage for the inline header bulk actions. */
const meta: Meta<typeof HeaderBulkActions> = {
  title: 'Organisms/Table/HeaderBulkActions States',
  component: HeaderBulkActions,
  parameters: {
    layout: 'centered',
  },
  args: {
    selectedCount: 3,
    bulkActions: [
      { label: 'Archive', icon: <Archive />, onClick: fn() },
      {
        label: 'Delete',
        icon: <Trash2 />,
        onClick: fn(),
        variant: 'destructive',
      },
    ],
    onClearSelection: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof HeaderBulkActions>;

/** Empty: nothing selected renders nothing. */
export const EmptySelection: Story = {
  args: {
    selectedCount: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText(/selected/)).toBeNull();
  },
};

/** Partial: actions without a clear handler, so no dismiss button. */
export const PartialNoClear: Story = {
  args: {
    onClearSelection: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Actions' })).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: 'Clear Selection' })
    ).toBeNull();
  },
};

/** Long content: a large selection count with long action labels. */
export const LongContentSelection: Story = {
  args: {
    selectedCount: 12_480,
    bulkActions: [
      {
        label: 'Archive every selected release and its pending deliveries',
        onClick: fn(),
      },
    ],
  },
};

/** Right-to-left: Arabic action labels inside an RTL document. */
export const RtlSelection: Story = {
  args: {
    bulkActions: [{ label: 'أرشفة', onClick: fn() }],
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
