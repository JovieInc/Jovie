import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queries/keys';
import { DashboardActivityFeed } from './DashboardActivityFeed';
import type { Activity, ActivityRange } from './types';

const profileId = 'story-profile';
const range: ActivityRange = '7d';
const storyActivities = [
  {
    id: 'activity-story-1',
    type: 'visit',
    description: 'New fan viewed the profile from Instagram.',
    icon: 'visit',
    timestamp: '2026-08-31T18:20:00.000Z',
    href: '/app/dashboard/audience',
  },
  {
    id: 'activity-story-2',
    type: 'click',
    description: 'Clicked Listen Now for Midnight Drive.',
    icon: 'listen',
    timestamp: '2026-08-31T17:05:00.000Z',
  },
] satisfies Activity[];

function createStoryQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  });

  queryClient.setQueryData(
    queryKeys.dashboard.activityFeed(profileId, range),
    storyActivities
  );

  return queryClient;
}

function DashboardActivityFeedStoryShell({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <QueryClientProvider client={createStoryQueryClient()}>
      <div className='w-[26rem] max-w-[calc(100vw-2rem)] bg-base p-4 text-primary-token'>
        {children}
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Dashboard/DashboardActivityFeed',
  component: DashboardActivityFeed,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <DashboardActivityFeedStoryShell>
        <Story />
      </DashboardActivityFeedStoryShell>
    ),
  ],
  args: {
    profileId,
    range,
  },
} satisfies Meta<typeof DashboardActivityFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecentActivity: Story = {};

export const ThirtyDays: Story = {
  args: {
    range: '30d',
  },
};
