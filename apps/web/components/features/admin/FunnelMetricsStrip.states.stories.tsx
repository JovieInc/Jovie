import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { FunnelMetricsStrip } from './FunnelMetricsStrip';
import {
  FUNNEL_METRICS_EMPTY,
  FUNNEL_METRICS_FIXTURE,
  FUNNEL_METRICS_LARGE,
  FUNNEL_METRICS_NO_STRIPE,
} from './FunnelMetricsStrip.fixture';

/** State coverage for the admin KPI strip; the default lives in FunnelMetricsStrip.stories.tsx. */
const meta = {
  title: 'Features/Admin/FunnelMetricsStrip States',
  component: FunnelMetricsStrip,
  parameters: { layout: 'padded' },
  args: { metrics: FUNNEL_METRICS_FIXTURE },
} satisfies Meta<typeof FunnelMetricsStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no activity and no revenue yet; runway asks for a bank balance. */
export const EmptyNoActivity: Story = {
  args: { metrics: FUNNEL_METRICS_EMPTY },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('No balance')).toBeVisible();
    await expect(
      canvas.getByText('Add bank balance to calculate')
    ).toBeVisible();
  },
};

/** Partial: Stripe is not connected, so revenue cards show dashes. */
export const PartialStripeDisconnected: Story = {
  args: { metrics: FUNNEL_METRICS_NO_STRIPE },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Connect Stripe to calculate')
    ).toBeVisible();
  },
};

/** Long content: very large revenue, counts and growth rates. */
export const LongContentLargeValues: Story = {
  args: { metrics: FUNNEL_METRICS_LARGE },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('$148,148,136')).toBeVisible();
  },
};

/** Right-to-left: the strip inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Core KPIs')).toBeVisible();
  },
};
