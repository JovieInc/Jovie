import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { APP_ROUTES } from '@/constants/routes';
import { ProfileCompletionCard } from './ProfileCompletionCard';

const mockDashboardData: DashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [
    {
      id: 'profile-1',
      username: 'midnightsignal',
      displayName: 'Midnight Signal',
    } as DashboardData['creatorProfiles'][0],
  ],
  selectedProfile: {
    id: 'profile-1',
    username: 'midnightsignal',
    displayName: 'Midnight Signal',
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
    percentage: 57,
    completedCount: 4,
    totalCount: 6,
    steps: [
      {
        id: 'avatar',
        label: 'Add a profile photo',
        description: 'A recognizable photo makes your page feel personal.',
        href: APP_ROUTES.SETTINGS_PROFILE,
      },
      {
        id: 'music-links',
        label: 'Connect your music links',
        description: 'Link Spotify or Apple Music so fans can listen.',
        href: APP_ROUTES.SETTINGS_PROFILE,
      },
      {
        id: 'email',
        label: 'Add your account email',
        description:
          'Email keeps your account recoverable and mission-critical.',
        href: APP_ROUTES.DASHBOARD_EARNINGS,
      },
    ],
    profileIsLive: true,
  },
};

const meta: Meta<typeof ProfileCompletionCard> = {
  title: 'Dashboard/Molecules/ProfileCompletionCard',
  component: ProfileCompletionCard,
  decorators: [
    Story => (
      <div className='max-w-3xl p-6'>
        <DashboardDataProvider value={mockDashboardData}>
          <Story />
        </DashboardDataProvider>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ProfileCompletionCard>;

export const Default: Story = {};
