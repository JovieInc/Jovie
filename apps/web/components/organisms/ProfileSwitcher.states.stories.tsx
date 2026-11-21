import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { IdentitySwitcher } from './ProfileSwitcher';

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

const [alpha, beta] = dashboardData.creatorProfiles;

function withData(data: DashboardData) {
  return function DataDecorator(Story: () => ReactNode) {
    return (
      <DashboardDataProvider value={data}>
        <div className='w-56 rounded-md bg-sidebar p-2 text-sidebar-foreground'>
          <Story />
        </div>
      </DashboardDataProvider>
    );
  };
}

/** Identity-count and name states that the base story does not name. */
const meta: Meta<typeof IdentitySwitcher> = {
  title: 'Organisms/IdentitySwitcher/States',
  component: IdentitySwitcher,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof IdentitySwitcher>;

/** Empty: a single identity, so the switcher renders nothing. */
export const EmptySingleIdentity: Story = {
  decorators: [
    withData({ ...dashboardData, creatorProfiles: [alpha] } as DashboardData),
  ],
};

/** Long content: identity names longer than the sidebar row, which truncate. */
export const LongContentNames: Story = {
  decorators: [
    withData({
      ...dashboardData,
      creatorProfiles: [
        {
          ...alpha,
          displayName: 'An Artist Identity With An Extremely Long Display Name',
        },
        beta,
      ],
      selectedProfile: {
        ...alpha,
        displayName: 'An Artist Identity With An Extremely Long Display Name',
      },
    } as DashboardData),
  ],
};
