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
    totalCount: 7,
    steps: [
      {
        id: 'avatar',
        label: 'Add a profile photo',
        description: 'A recognizable photo makes your page feel personal.',
        href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
      },
      {
        id: 'bio',
        label: 'Write a short bio',
        description: 'Tell new fans who you are in one or two lines.',
        href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
      },
      {
        id: 'tip-jar',
        label: 'Set up your tip jar',
        description: 'Turn attention into support with a fast tipping link.',
        href: APP_ROUTES.DASHBOARD_EARNINGS,
      },
    ],
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
