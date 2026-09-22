import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AdminUserRow } from '@/lib/admin/types';
import { AdminUsersTableUnified } from './AdminUsersTableUnified';

const users: AdminUserRow[] = [
  {
    id: 'user_1',
    clerkId: 'clerk_1',
    name: 'Ari Lane',
    email: 'ari@example.com',
    userStatus: 'active',
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    deletedAt: null,
    isPro: true,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    plan: 'pro',
    profileUsername: 'ari-lane',
    profileCreatedAt: new Date('2026-01-10T00:00:00.000Z'),
    profileOrigin: 'spotify',
    founderWelcomeSentAt: null,
    welcomeFailedAt: null,
    outboundSuppressedAt: null,
    suppressionFailedAt: null,
  } as AdminUserRow,
];

const meta: Meta<typeof AdminUsersTableUnified> = {
  title: 'Admin/Tables/Users',
  component: AdminUsersTableUnified,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: [
        'user',
        'isSelected',
        'onToggleSelect',
        'contextMenuItems',
      ],
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    users,
    page: 1,
    pageSize: 25,
    total: users.length,
    search: '',
    sort: 'created_desc',
  },
};

export const Empty: Story = {
  args: {
    users: [],
    page: 1,
    pageSize: 25,
    total: 0,
    search: 'no-such-user',
    sort: 'created_desc',
  },
};
