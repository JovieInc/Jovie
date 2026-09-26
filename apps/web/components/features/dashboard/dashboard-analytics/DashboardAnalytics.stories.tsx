import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { DashboardAnalytics } from './DashboardAnalytics';

const profile = {
  id: 'profile-1',
  userId: 'story-user',
  username: 'midnightsignal',
  displayName: 'Midnight Signal',
} as DashboardData['creatorProfiles'][0];

const dashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [profile],
  selectedProfile: profile,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: true,
  hasMusicLinks: true,
  isAdmin: false,
} as DashboardData;

const meta = {
  title: 'Dashboard/Analytics/DashboardAnalytics',
  component: DashboardAnalytics,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: ['loading'],
    },
  },
  decorators: [
    Story => (
      <DashboardDataProvider value={dashboardData}>
        <div className='min-h-screen bg-surface-0 p-6 text-primary-token'>
          <Story />
        </div>
      </DashboardDataProvider>
    ),
  ],
} satisfies Meta<typeof DashboardAnalytics>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
