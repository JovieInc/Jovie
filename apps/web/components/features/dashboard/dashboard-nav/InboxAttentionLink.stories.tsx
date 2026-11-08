import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InboxAttentionLink } from './InboxAttentionLink';

const meta: Meta<typeof InboxAttentionLink> = {
  title: 'Dashboard/Navigation/Inbox Attention Link',
  component: InboxAttentionLink,
  parameters: { layout: 'centered' },
  args: {
    label: 'Inbox',
    itemId: 'home',
    attention: 'empty',
    pendingCount: 0,
    runtimeUpdate: false,
    navigationPending: false,
  },
  decorators: [
    Story => (
      <div className='bg-sidebar p-3'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof InboxAttentionLink>;

export const Empty: Story = {};

export const Pending: Story = {
  args: {
    label: 'Inbox, 3 pending items',
    attention: 'available',
    pendingCount: 3,
  },
};

export const UpdateAvailable: Story = {
  args: {
    label: 'Inbox, app update available',
    attention: 'available',
    runtimeUpdate: true,
  },
};

export const NavigationPending: Story = {
  args: { navigationPending: true },
};
