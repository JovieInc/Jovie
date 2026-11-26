import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DashboardStoryProviders } from '@/.storybook/dashboard-fixtures';
import type { AdminUserRow } from '@/lib/admin/types';
import { AdminPeopleRightPanelProvider } from '../AdminPeopleRightPanelProvider';
import { AdminUsersTableUnified } from './AdminUsersTableUnified';

const baseUser = {
  id: 'user_states_1',
  clerkId: 'clerk_states_1',
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
} as AdminUserRow;

const meta = {
  title: 'Admin/Tables/Users/States',
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
  args: {
    users: [baseUser],
    page: 1,
    pageSize: 25,
    total: 1,
    search: '',
    sort: 'created_desc',
  },
  decorators: [
    function UsersStatesFrame(Story) {
      return (
        <DashboardStoryProviders>
          <AdminPeopleRightPanelProvider>
            <Story />
          </AdminPeopleRightPanelProvider>
        </DashboardStoryProviders>
      );
    },
  ],
} satisfies Meta<typeof AdminUsersTableUnified>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: a subscriber with no name, no profile and no plan yet. */
export const PartialEmailSubscriber: Story = {
  args: {
    users: [
      {
        ...baseUser,
        name: null,
        profileUsername: null,
        profileCreatedAt: null,
        profileOrigin: null,
        isPro: false,
        plan: 'free',
      } as AdminUserRow,
    ],
  },
};

/** Long content: a long name and email stay inside their cells. */
export const LongContentIdentity: Story = {
  args: {
    users: [
      {
        ...baseUser,
        name: 'Alexandria Montgomery-Featherstonehaugh the Third of Westminster',
        email:
          'alexandria.montgomery.featherstonehaugh.the.third@extremely-long-domain-name-for-testing.example.com',
      } as AdminUserRow,
    ],
  },
};

/** Right-to-left: Arabic name in an RTL admin page. */
export const RtlArabicName: Story = {
  args: { users: [{ ...baseUser, name: 'آري لين' } as AdminUserRow] },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
