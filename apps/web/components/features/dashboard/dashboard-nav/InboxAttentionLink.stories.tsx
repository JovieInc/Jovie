import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InboxAttentionLink } from './InboxAttentionLink';

const meta: Meta<typeof InboxAttentionLink> = {
  title: 'Dashboard/Navigation/Inbox Attention Link',
  component: InboxAttentionLink,
  parameters: { layout: 'centered' },
  args: {
    label: 'Home — all caught up',
    itemId: 'home',
    attention: 'empty',
    pendingCount: 0,
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
    label: 'Home — 3 Items Need Attention',
    attention: 'available',
    pendingCount: 3,
  },
};

export const NavigationPending: Story = {
  args: { navigationPending: true },
};

/** The pending count has not loaded yet, so the bell shows no badge. */
export const Partial: Story = {
  args: {
    label: 'Home — notifications',
    attention: 'unknown',
  },
};

/** A large backlog caps the badge at 99 so the bell keeps its size. */
export const LongContent: Story = {
  args: {
    // The badge caps its visible count at 99+; the accessible name must
    // describe what is rendered (label-content-name-mismatch otherwise).
    label: 'Home — 140 Items Need Attention',
    attention: 'available',
    pendingCount: 140,
  },
};

export const Rtl: Story = {
  args: {
    label: 'البريد الوارد، 3 عناصر معلقة',
    attention: 'available',
    pendingCount: 3,
  },
  render: args => (
    <div dir='rtl'>
      <InboxAttentionLink {...args} />
    </div>
  ),
};
