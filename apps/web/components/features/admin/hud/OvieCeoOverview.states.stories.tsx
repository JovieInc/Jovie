import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { HudMetrics } from '@/types/hud';
import { OvieCeoOverview } from './OvieCeoOverview';

const observedAtIso = '2026-08-22T18:00:00.000Z';

function buildMetrics(
  overrides: {
    stripeState?: string;
    mercuryState?: string;
    error?: string;
  } = {}
): HudMetrics {
  const source = (key: string, label: string, state: string) => ({
    key,
    label,
    state,
    fetchedAtIso: observedAtIso,
    errorMessage: overrides.error ?? null,
    dashboardUrl: null,
    configureUrl: null,
    nextStep: null,
  });
  return {
    overview: {
      mrrUsd: 5200,
      activeSubscribers: 42,
      balanceUsd: 100_000,
      burnRateUsd: 30_000,
      runwayMonths: 4,
      defaultStatus: 'alive',
      defaultStatusDetail: 'Runway covers the profitability horizon.',
      financialDataAvailable: true,
    },
    sources: {
      stripe: source('stripe', 'Stripe', overrides.stripeState ?? 'ok'),
      mercury: source('mercury', 'Mercury', overrides.mercuryState ?? 'ok'),
    },
    aiOps: { counts: { blocked: 0, failed: 0 } },
    generatedAtIso: observedAtIso,
  } as HudMetrics;
}

const meta = {
  title: 'Features/Admin/Hud/OvieCeoOverview/States',
  component: OvieCeoOverview,
  parameters: { layout: 'padded' },
  args: { metrics: buildMetrics() },
} satisfies Meta<typeof OvieCeoOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no finance source is configured, so company metrics have no data. */
export const EmptyNoSourcesConfigured: Story = {
  args: {
    metrics: buildMetrics({
      stripeState: 'not_configured',
      mercuryState: 'not_configured',
    }),
  },
};

/** Error: a source is unavailable and offers Retry. */
export const ErrorSourceUnavailable: Story = {
  args: {
    metrics: buildMetrics({ stripeState: 'unavailable' }),
    onRetry: () => undefined,
  },
};

/** Partial: one source is healthy and the other is degraded. */
export const PartialOneSourceDegraded: Story = {
  args: { metrics: buildMetrics({ mercuryState: 'degraded' }) },
};

/** Long content: a long source error message in a narrow container. */
export const LongContentErrorMessage: Story = {
  args: {
    metrics: buildMetrics({
      stripeState: 'unavailable',
      error:
        'Stripe returned an error that is far longer than the card can show on one line and keeps going to prove clamping',
    }),
  },
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='w-96'>
          <Story />
        </div>
      );
    },
  ],
};

/** Rtl: the overview in a right-to-left document. */
export const RtlOverview: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
