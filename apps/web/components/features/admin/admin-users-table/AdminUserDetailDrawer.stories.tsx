import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { AdminUserRow } from '@/lib/admin/types';
import { AdminUserDetailDrawer } from './AdminUserDetailDrawer';

const user: AdminUserRow = {
  id: 'user-1',
  clerkId: 'clerk-1',
  name: 'Alex Rivera',
  email: 'alex@example.com',
  userStatus: 'active',
  createdAt: new Date('2026-07-01T12:00:00Z'),
  deletedAt: null,
  isPro: true,
  stripeCustomerId: 'cus_123',
  stripeSubscriptionId: null,
  plan: 'pro',
  profileUsername: 'alex',
  founderWelcomeSentAt: null,
  welcomeFailedAt: null,
  outboundSuppressedAt: null,
  suppressionFailedAt: null,
  profileCreatedAt: new Date('2026-07-01T12:00:00Z'),
  profileOrigin: 'onboarding',
  socialLinks: [],
};

const meta = {
  title: 'Features/Admin/AdminUserDetailDrawer',
  component: AdminUserDetailDrawer,
  args: {
    user,
    onClose: fn(),
  },
  decorators: [
    Story => (
      <div
        className='flex min-h-0 justify-end'
        style={{ height: 'calc(100svh - 2rem)' }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AdminUserDetailDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Selected: Story = {};

export const Empty: Story = {
  args: {
    user: null,
  },
};
