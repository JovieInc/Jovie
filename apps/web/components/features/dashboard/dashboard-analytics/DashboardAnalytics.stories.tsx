import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { expect, within } from 'storybook/test';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { STABLE_CACHE } from '@/lib/queries/cache-strategies';
import { queryKeys } from '@/lib/queries/keys';
import type { DashboardAnalyticsResponse } from '@/types/analytics';
import { DashboardAnalytics } from './DashboardAnalytics';
import { ANALYTICS_PAGE_RANGES } from './types';

const profile = {
  id: 'profile-1',
  userId: 'story-user',
  username: 'midnightsignal',
  displayName: 'Midnight Signal',
  // Every real creator_profiles row has createdAt; the analytics adapter
  // serializes it.
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
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

const analytics: DashboardAnalyticsResponse = {
  profile_views: 100,
  unique_users: 50,
  subscribers: 5,
  top_cities: [{ city: 'London', count: 9 }],
  top_countries: [{ country: 'GB', count: 9 }],
  top_referrers: [{ referrer: 'instagram.com', count: 8 }],
  top_links: [{ id: 'listen', url: 'listen', clicks: 7 }],
  top_operating_systems: [
    { os: 'iOS', count: 12 },
    { os: 'Android', count: 8 },
    { os: 'Unknown', count: 4 },
  ],
};

function AnalyticsStoryFrame({
  children,
  data,
}: {
  readonly children: ReactNode;
  readonly data: DashboardAnalyticsResponse;
}) {
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { ...STABLE_CACHE, retry: false } },
    });
    for (const range of ANALYTICS_PAGE_RANGES) {
      queryClient.setQueryData(queryKeys.dashboard.analytics(range), data);
    }
    return queryClient;
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

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
    (Story, context) => (
      <AnalyticsStoryFrame data={context.parameters.analyticsData ?? analytics}>
        <DashboardDataProvider value={dashboardData}>
          <div className='min-h-screen bg-surface-0 p-6 text-primary-token'>
            <Story />
          </div>
        </DashboardDataProvider>
      </AnalyticsStoryFrame>
    ),
  ],
} satisfies Meta<typeof DashboardAnalytics>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: 'Clicks by operating system' })
    ).toBeVisible();
    await expect(canvas.getByText('iOS')).toBeVisible();
    await expect(canvas.getByText('Unknown')).toBeVisible();
  },
};

export const Empty: Story = {
  parameters: {
    analyticsData: {
      profile_views: 0,
      top_cities: [],
      top_countries: [],
      top_referrers: [],
      top_operating_systems: [],
    } satisfies DashboardAnalyticsResponse,
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('No operating system data yet')
    ).toBeVisible();
  },
};
