import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { computePmfMetrics } from '@/lib/admin/pmf-metrics-model';
import { PmfMetricsPanel } from './PmfMetricsPanel';

const meta = {
  title: 'Features/Admin/Leads/PmfMetricsPanel',
  component: PmfMetricsPanel,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof PmfMetricsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BelowTarget: Story = {
  args: {
    metrics: computePmfMetrics({
      admittedUsers: 48,
      activatedUsers: 19,
      surveyResponses: 12,
      veryDisappointed: 4,
    }),
  },
};

export const TargetMet: Story = {
  args: {
    metrics: computePmfMetrics({
      admittedUsers: 48,
      activatedUsers: 30,
      surveyResponses: 20,
      veryDisappointed: 9,
    }),
  },
};

export const NoAnswersYet: Story = {
  args: {
    metrics: computePmfMetrics({
      admittedUsers: 12,
      activatedUsers: 5,
      surveyResponses: 0,
      veryDisappointed: 0,
    }),
  },
};

export const Unavailable: Story = { args: { metrics: null } };
