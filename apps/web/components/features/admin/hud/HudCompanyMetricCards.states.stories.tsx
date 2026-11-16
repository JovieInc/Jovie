import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { cockpitMetrics, cockpitShipping } from '@/tests/fixtures/hud-cockpit';
import { HudCompanyMetricCards } from './HudCompanyMetricCards';

/** State coverage for the cockpit's top metric row. */
const meta = {
  title: 'Features/Admin/Hud/HudCompanyMetricCards States',
  component: HudCompanyMetricCards,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudCompanyMetricCards>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: very large values and a long unavailable-source detail. */
export const LongContentValues: Story = {
  args: {
    metrics: cockpitMetrics({
      overview: {
        financialDataAvailable: false,
        defaultStatusDetail:
          'Mercury and Stripe both timed out while the HUD was polling, so the company numbers cannot be trusted until the sources recover.',
        runwayMonths: null,
        balanceUsd: 0,
        mrrUsd: 0,
        activeSubscribers: 0,
        weekAgo: null,
      },
      aiOps: {
        counts: { blocked: 12_345, failed: 6_789 },
        mergeQueue: { openAgentPrs: 9_876 },
        blockers: [],
      },
      reliability: { unresolvedSentryIssues24h: 54_321, p95LatencyMs: 40 },
    }),
    shipping: cockpitShipping,
  },
};

/** Right-to-left: the metric row inside an RTL document. */
export const RtlDocument: Story = {
  args: { metrics: cockpitMetrics(), shipping: cockpitShipping },
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
