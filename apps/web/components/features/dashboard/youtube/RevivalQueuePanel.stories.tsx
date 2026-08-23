import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type {
  ExperimentRecord,
  RevivalCandidate,
} from '@/lib/services/youtube-revival/types';
import { RevivalQueuePanel } from './RevivalQueuePanel';

const candidate: RevivalCandidate = {
  videoId: 'video-1',
  title: 'A Quiet Revival',
  publishedAt: '2026-01-01T00:00:00.000Z',
  flags: ['ctr_below_median', 'evergreen_declining_reach'],
  opportunityScore: 87,
  challengers: [
    {
      hypothesis: 'Lead with the artist portrait',
      packagingElement: 'face',
      rationale: 'Portrait-led packaging wins in this channel niche.',
    },
  ],
  metrics: {
    impressions: 12_500,
    ctr: 0.032,
    views: 400,
    watchMinPerImpression: 0.41,
    reachTrend: -0.18,
    trafficSource: 'browse_features',
  },
};

const experiment: ExperimentRecord = {
  experimentId: 'experiment-1',
  videoId: candidate.videoId,
  videoTitle: candidate.title,
  status: 'running',
  startedAt: '2026-08-01T00:00:00.000Z',
  baseline: { ctr: 0.032, watchMinPerImpression: 0.41 },
  challenger: { ctr: 0.041, watchMinPerImpression: 0.5 },
  challengerWon: null,
};

const meta = {
  title: 'Features/YouTube/RevivalQueuePanel',
  component: RevivalQueuePanel,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  decorators: [
    Story => (
      <div className='flex h-[42rem] min-w-0 bg-surface-page'>
        <Story />
      </div>
    ),
  ],
  args: {
    candidates: [],
    experiments: [],
    quota: null,
    intelligenceReport: null,
    isConnected: false,
  },
} satisfies Meta<typeof RevivalQueuePanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Disconnected: Story = {};

export const ConnectedCurrent: Story = {
  args: { isConnected: true },
};

export const Populated: Story = {
  args: {
    isConnected: true,
    candidates: [candidate],
    experiments: [experiment],
    quota: {
      usedToday: 850,
      dailyCap: 1_000,
      swapsToday: 3,
      maxSwapsPerDay: 5,
    },
  },
};

export const Narrow: Story = {
  ...Populated,
  decorators: [
    Story => (
      <div className='mx-auto flex h-[42rem] w-90 max-w-full bg-surface-page'>
        <Story />
      </div>
    ),
  ],
};
