import type { Meta, StoryObj } from '@storybook/nextjs-vite';
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

const meta = {
  title: 'Features/Admin/ReliabilityCard',
  component: ReliabilityCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['summary'],
    },
  },
} satisfies Meta<typeof ReliabilityCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { summary },
};
