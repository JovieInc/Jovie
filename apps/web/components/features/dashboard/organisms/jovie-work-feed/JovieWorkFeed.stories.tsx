import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import type { JovieWorkItem } from '@/lib/activity/jovie-work-feed';
import { queryKeys } from '@/lib/queries/keys';
import { JovieWorkFeed } from './JovieWorkFeed';

const profileId = 'story-profile';
const range = '7d';
const storyItems = [
  {
    id: 'workflow-story',
    source: 'workflow_run',
    phase: 'completed',
    title: 'Release autopilot',
    description: 'Jovie ran release-to-revenue for Midnight Drive.',
    icon: 'workflow',
    timestamp: '2026-08-31T18:20:00.000Z',
    statusLabel: 'Done',
    href: '/app/releases',
    outcomeSlot: 'release_outcome',
    outcome: {
      state: 'measured_positive',
      metrics: {
        gmvDeltaCents: 1800,
        clickDelta: 12,
        dspClickDelta: 7,
        newFansDelta: 3,
      },
    },
  },
  {
    id: 'agent-story',
    source: 'agent_run',
    phase: 'in_progress',
    title: 'Metadata agent',
    description: 'Metadata Agent is preparing DSP copy.',
    icon: 'agent',
    timestamp: '2026-08-31T17:05:00.000Z',
    statusLabel: 'Running',
  },
] satisfies JovieWorkItem[];

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
    queryKeys.dashboard.jovieWorkFeed(profileId, range),
    storyItems
  );

  return queryClient;
}

function JovieWorkFeedStoryShell({
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
  title: 'Features/Dashboard/JovieWorkFeed',
  component: JovieWorkFeed,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <JovieWorkFeedStoryShell>
        <Story />
      </JovieWorkFeedStoryShell>
    ),
  ],
  args: {
    profileId,
    range,
    showHeader: true,
  },
} satisfies Meta<typeof JovieWorkFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithAutonomousWork: Story = {};

export const WithoutHeader: Story = {
  args: {
    showHeader: false,
  },
};
