import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { JovieWorkItem } from '@/lib/activity/jovie-work-feed';
import { queryKeys } from '@/lib/queries/keys';
import { JovieWorkFeed } from './JovieWorkFeed';

const profileId = 'story-profile';
const range = '7d';
const queryKey = queryKeys.dashboard.jovieWorkFeed(profileId, range);

const baseItem: JovieWorkItem = {
  id: 'workflow-story',
  source: 'workflow_run',
  phase: 'completed',
  title: 'Release autopilot',
  description: 'Jovie ran release-to-revenue for Midnight Drive.',
  icon: 'workflow',
  timestamp: '2026-08-31T18:20:00.000Z',
  statusLabel: 'Done',
  href: '/app/releases',
};

type Seed = JovieWorkItem[] | 'loading' | 'error';

function makeClient(seed: Seed) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
    },
  });
  if (seed === 'loading') {
    void client.prefetchQuery({
      queryKey,
      queryFn: () => new Promise<JovieWorkItem[]>(() => undefined),
    });
  } else if (seed === 'error') {
    client
      .getQueryCache()
      .build<JovieWorkItem[], Error>(client, { queryKey })
      .setState({
        status: 'error',
        error: new Error('The work feed is unavailable right now.'),
        fetchStatus: 'idle',
      });
  } else {
    client.setQueryData(queryKey, seed);
  }
  return client;
}

function shell(seed: Seed, dir?: 'rtl'): Decorator {
  return function JovieWorkFeedStatesShell(Story) {
    return (
      <QueryClientProvider client={makeClient(seed)}>
        <div
          dir={dir}
          className='w-96 max-w-full bg-base p-4 text-primary-token'
        >
          <Story />
        </div>
      </QueryClientProvider>
    );
  };
}

const meta = {
  title: 'Features/Dashboard/JovieWorkFeed States',
  component: JovieWorkFeed,
  parameters: { layout: 'centered' },
  args: { profileId, range, showHeader: true },
} satisfies Meta<typeof JovieWorkFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  decorators: [shell('loading')],
};

export const EmptyWindow: Story = {
  decorators: [shell([])],
};

export const ErrorLoadFailed: Story = {
  decorators: [shell('error')],
};

export const LongContentRuns: Story = {
  decorators: [
    shell([
      {
        ...baseItem,
        title:
          'Release autopilot for the Midnight Drive deluxe edition and its remixes',
        description:
          'Jovie ran release-to-revenue, refreshed DSP metadata across eleven platforms, retouched the artwork, notified 4,812 fans and prepared merch drops for the tour.',
        outcomeSlot: 'release_outcome',
        outcome: {
          state: 'measured_positive',
          metrics: {
            gmvDeltaCents: 12_345_600,
            clickDelta: 98_765,
            dspClickDelta: 45_678,
            newFansDelta: 12_345,
          },
        },
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        ...baseItem,
        id: `agent-${index}`,
        source: 'agent_run' as const,
        phase: 'in_progress' as const,
        icon: 'agent' as const,
        title: `Metadata agent run ${index + 1}`,
        statusLabel: 'Running',
        href: undefined,
      })),
    ]),
  ],
};

export const RtlDocument: Story = {
  decorators: [
    shell(
      [
        {
          ...baseItem,
          title: 'الإطلاق التلقائي',
          description:
            'شغّل جوفي مسار الإصدار إلى الإيرادات لأغنية Midnight Drive.',
        },
        {
          ...baseItem,
          id: 'agent-rtl',
          source: 'agent_run',
          phase: 'failed',
          icon: 'agent',
          title: 'סוכן מטא-דאטה',
          description: 'הסוכן לא הצליח להגיע למפיץ.',
          statusLabel: 'נכשל',
        },
      ],
      'rtl'
    ),
  ],
};
