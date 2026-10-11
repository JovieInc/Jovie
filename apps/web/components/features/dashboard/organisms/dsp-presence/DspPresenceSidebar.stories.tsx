import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fn } from 'storybook/test';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import type { DspPresenceItem } from '@/app/app/(shell)/dashboard/presence/actions';
import { DspPresenceSidebar } from './DspPresenceSidebar';

const storyQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
  },
});

const dashboardData: DashboardData = {
  user: { id: 'story-user' },
  creatorProfiles: [],
  selectedProfile: { id: 'profile-123' } as DashboardData['selectedProfile'],
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

const suggestedItem: DspPresenceItem = {
  matchId: 'match-1',
  providerId: 'spotify',
  status: 'suggested',
  confidenceScore: 0.91,
  matchingIsrcCount: 3,
  matchSource: 'isrc_discovery',
  confirmedAt: null,
  externalArtistName: 'Midnight Echo',
  externalArtistUrl: 'https://open.spotify.com/artist/123',
  externalArtistImageUrl: null,
  confidenceBreakdown: null,
};

const meta = {
  title: 'Features/Dashboard/DspPresence/DspPresenceSidebar',
  component: DspPresenceSidebar,
  args: {
    item: suggestedItem,
    onClose: fn(),
  },
  decorators: [
    Story => (
      <QueryClientProvider client={storyQueryClient}>
        <DashboardDataProvider value={dashboardData}>
          <Story />
        </DashboardDataProvider>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof DspPresenceSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SuggestedMatch: Story = {};

export const Empty: Story = {
  args: {
    item: null,
  },
};
