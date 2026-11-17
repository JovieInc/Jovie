import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import type { AdminReliabilitySummary } from '@/lib/admin/reliability';
import { ReliabilityCard } from './ReliabilityCard';

const summary: AdminReliabilitySummary = {
  errorRatePercent: 0.4,
  reliabilityScorePercent: 99.6,
  p95LatencyMs: 320,
  incidents24h: 0,
  lastIncidentAt: null,
  unresolvedSentryIssues24h: 0,
  redisAvailable: true,
  deploymentAvailability: 'available',
  deploymentState: 'success',
};

/** State coverage for the admin reliability card; the default lives in ReliabilityCard.stories.tsx. */
const meta = {
  title: 'Features/Admin/ReliabilityCard States',
  component: ReliabilityCard,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-96'>
        <Story />
      </div>
    ),
  ],
  args: { summary },
} satisfies Meta<typeof ReliabilityCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Error: the deploy read failed and Redis is down, so the card reads Critical. */
export const ErrorDeployReadAndRedisDown: Story = {
  args: {
    summary: {
      ...summary,
      redisAvailable: false,
      deploymentAvailability: 'error',
      deploymentState: null,
      incidents24h: 2,
      lastIncidentAt: new Date('2026-11-13T09:00:00.000Z'),
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Critical')).toBeVisible();
    await expect(canvas.getAllByText('Unavailable')).toHaveLength(2);
  },
};

/** Long content: large counts, a slow p95 and the incident follow-up note. */
export const LongContentLargeCounts: Story = {
  args: {
    summary: {
      ...summary,
      errorRatePercent: 3.21,
      p95LatencyMs: 123_456,
      incidents24h: 4,
      unresolvedSentryIssues24h: 98_765,
      lastIncidentAt: new Date('2026-11-13T09:00:00.000Z'),
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/Review logs and alerts/)
    ).toBeVisible();
  },
};

/** Right-to-left: the card inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Error Rate')).toBeVisible();
  },
};
