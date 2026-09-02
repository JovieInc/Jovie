import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ProfileSwitcher } from './ProfileSwitcher';

const dashboardData: DashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [
    {
      id: 'profile-alpha',
      avatarUrl: null,
      displayName: 'Alpha Artist',
      username: 'alpha',
      usernameNormalized: 'alpha',
    } as DashboardData['creatorProfiles'][number],
    {
      id: 'profile-beta',
      avatarUrl: null,
      displayName: 'Beta Artist',
      username: 'beta',
      usernameNormalized: 'beta',
    } as DashboardData['creatorProfiles'][number],
  ],
  selectedProfile: {
    id: 'profile-alpha',
    avatarUrl: null,
    displayName: 'Alpha Artist',
    username: 'alpha',
    usernameNormalized: 'alpha',
  } as DashboardData['selectedProfile'],
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: true,
  hasMusicLinks: true,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 100,
    completedCount: 4,
    totalCount: 4,
    steps: [],
    profileIsLive: true,
  },
};

const meta: Meta<typeof ProfileSwitcher> = {
  title: 'Organisms/ProfileSwitcher',
  component: ProfileSwitcher,
  decorators: [
    Story => (
      <DashboardDataProvider value={dashboardData}>
        <div className='w-56 rounded-md bg-sidebar p-2 text-sidebar-foreground'>
          <Story />
        </div>
      </DashboardDataProvider>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof ProfileSwitcher>;

export const Default: Story = {};
