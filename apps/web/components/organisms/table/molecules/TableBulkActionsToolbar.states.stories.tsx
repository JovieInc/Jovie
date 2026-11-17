import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Archive } from 'lucide-react';
import { expect, fn, within } from 'storybook/test';
import { TableBulkActionsToolbar } from './TableBulkActionsToolbar';

/** State coverage for the selection overlay toolbar. */
const meta: Meta<typeof TableBulkActionsToolbar> = {
  title: 'Organisms/Table/TableBulkActionsToolbar States',
  component: TableBulkActionsToolbar,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    function OverlayHost(Story) {
      return (
        <div className='relative min-h-11'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    selectedCount: 3,
    onClearSelection: fn(),
    actions: [{ label: 'Archive', icon: <Archive />, onClick: fn() }],
  },
};

export default meta;
type Story = StoryObj<typeof TableBulkActionsToolbar>;

/** Empty: nothing selected keeps a hidden overlay with no controls. */
export const EmptySelection: Story = {
  args: {
    selectedCount: 0,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button')).toBeNull();
  },
};

/** Long content: a large selection with long action labels. */
export const LongContentSelection: Story = {
  args: {
    selectedCount: 12_480,
    actions: [
      {
        label: 'Archive every selected release and its pending deliveries',
        onClick: fn(),
      },
      {
        label: 'Remove every selected release from the distribution queue',
        onClick: fn(),
        variant: 'destructive',
      },
    ],
  },
};

/** Right-to-left: Arabic labels inside an RTL document. */
export const RtlSelection: Story = {
  args: {
    actions: [{ label: 'أرشفة', onClick: fn() }],
  },
  decorators: [
    function RtlDocument(Story) {
      return (
        <div dir='rtl' className='relative min-h-11'>
          <Story />
        </div>
      );
    },
  ],
};
