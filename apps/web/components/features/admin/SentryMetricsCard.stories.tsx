import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AdminSentryMetrics } from '@/lib/admin/sentry-metrics';
import { SentryMetricsCard } from './SentryMetricsCard';

const metrics: AdminSentryMetrics = {
  unresolvedIssues24h: 3,
  totalEvents24h: 128,
  impactedUsers24h: 14,
  criticalIssues24h: 0,
  topIssueTitle: 'TypeError: Cannot read property of undefined',
  topIssueShortId: 'JOVIE-42',
  isConfigured: true,
  isAvailable: true,
};

const meta = {
  title: 'Features/Admin/SentryMetricsCard',
  component: SentryMetricsCard,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['metrics', 'icon'],
    },
  },
} satisfies Meta<typeof SentryMetricsCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { metrics },
};
