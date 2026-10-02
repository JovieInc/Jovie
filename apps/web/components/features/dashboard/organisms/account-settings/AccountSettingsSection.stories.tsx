import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withSignedInSession } from '@/.storybook/signed-in-session';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { JovieAuthValuesProvider } from '@/hooks/useJovieAuth';
import { AccountSettingsSection } from './AccountSettingsSection';

const DASHBOARD_DATA: DashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [],
  selectedProfile: {
    id: 'story-profile',
    username: 'storyprofile',
    usernameNormalized: 'storyprofile',
    displayName: 'Story Profile',
    avatarUrl: null,
  } as DashboardData['selectedProfile'],
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
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
    percentage: 0,
    completedCount: 0,
    totalCount: 6,
    steps: [],
    profileIsLive: false,
  },
};

const meta = {
  title: 'Dashboard/Organisms/AccountSettings/AccountSettingsSection',
  component: AccountSettingsSection,
  parameters: {
    layout: 'padded',
  },
  args: {
    isGrowth: false,
  },
  decorators: [
    Story => (
      <DashboardDataProvider value={DASHBOARD_DATA}>
        <div className='max-w-2xl'>
          <Story />
        </div>
      </DashboardDataProvider>
    ),
  ],
} satisfies Meta<typeof AccountSettingsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedOut: Story = {};

export const SignedIn: Story = {
  decorators: [
    withSignedInSession,
    Story => (
      <JovieAuthValuesProvider>
        <Story />
      </JovieAuthValuesProvider>
    ),
  ],
};
