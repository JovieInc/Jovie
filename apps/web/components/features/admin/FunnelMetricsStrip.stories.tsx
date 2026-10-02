import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { AdminFunnelMetrics } from '@/lib/admin/funnel-metrics';
import { FunnelMetricsStrip } from './FunnelMetricsStrip';

const metrics: AdminFunnelMetrics = {
  instagramShareStepViews7d: 20,
  instagramBioCopies7d: 12,
  instagramBioOpenRate7d: 0.4,
  instagramBioActivations7d: 6,
  instagramBioActivationRate7d: 0.3,
  outreachSent7d: 150,
  claimClicks7d: 30,
  claimRate: 0.2,
  signups7d: 10,
  signupRate: 0.333,
  paidConversions7d: 2,
  paidConversionRate: 0.2,
  mrrUsd: 500,
  arrUsd: 6000,
  payingCustomers: 12,
  runwayMonths: null,
  defaultAliveDate: null,
  wowGrowthRate: null,
  momGrowthRate: 0.25,
  churnRate: null,
  retention30d: null,
  retention60d: null,
  retention90d: null,
  engagementActiveProfiles30d: null,
  cacUsd: null,
  ltvUsd: null,
  paybackPeriodMonths: null,
  stripeAvailable: true,
  errors: [],
  outreachToSignupRate: 0.067,
  signupToPaidRate: 0.2,
  dollarPerOutreach: 0.003,
  magicMomentRate: 0.75,
  magicMomentCount: 15,
  enrichmentFailureRate: 0.1,
};

const meta = {
  title: 'Features/Admin/FunnelMetricsStrip',
  component: FunnelMetricsStrip,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: [
        'metrics',
        'title',
        'value',
        'subtitle',
        'icon',
        'description',
      ],
    },
  },
} satisfies Meta<typeof FunnelMetricsStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { metrics },
};
