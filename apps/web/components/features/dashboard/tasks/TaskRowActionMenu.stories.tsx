import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { TaskRowActionMenu } from './TaskRowActionMenu';

const meta = {
  title: 'Features/Dashboard/Tasks/TaskRowActionMenu',
  component: TaskRowActionMenu,
  parameters: { layout: 'centered' },
  args: {
    items: [
      { id: 'archive', label: 'Archive', onClick: fn() },
      { id: 'delete', label: 'Delete', onClick: fn() },
    ],
  },
} satisfies Meta<typeof TaskRowActionMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: a row with no actions available. */
export const EmptyNoActions: Story = { args: { items: [] } };

/** Partial: hover-only visibility on a row that is not selected. */
export const PartialHoverVisibility: Story = {
  args: { visibility: 'hover', selected: false },
};

/** Long content: an action label far wider than the menu. */
export const LongContentActionLabel: Story = {
  args: {
    items: [
      {
        id: 'long',
        label:
          'Move this task to the release planning board for the next quarter',
        onClick: fn(),
      },
    ],
  },
};

/** Rtl: the trigger inside a right-to-left container. */
export const RtlTrigger: Story = {
  args: { items: [{ id: 'archive', label: 'أرشفة', onClick: fn() }] },
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
