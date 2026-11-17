import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { cockpitMetrics } from '@/tests/fixtures/hud-cockpit';
import type { HudMetrics } from '@/types/hud';
import { HudExceptionsStrip } from './HudExceptionsStrip';

const meta = {
  title: 'Features/Admin/Hud/HudExceptionsStrip States',
  component: HudExceptionsStrip,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudExceptionsStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

const failingSource = {
  key: 'stripe',
  label: 'Stripe',
  state: 'error',
  fetchedAtIso: '2026-09-28T12:00:00.000Z',
  errorMessage: 'Request failed (500)',
  dashboardUrl: null,
  configureUrl: null,
  nextStep: null,
};

/** Empty: no exceptions, so the strip shows the nominal line. */
export const EmptyNoExceptions: Story = {
  args: { metrics: cockpitMetrics({ sources: {} }) },
};

/** Error: a failed deploy and unresolved errors need founder attention. */
export const ErrorDeployFailed: Story = {
  args: {
    metrics: cockpitMetrics({
      sources: {},
      deployments: {
        current: { status: 'failure', branch: 'main', url: null },
      },
      reliability: { unresolvedSentryIssues24h: 7, p95LatencyMs: 1840 },
    }),
  },
};

const everythingWrong: HudMetrics = cockpitMetrics({
  sources: { stripe: failingSource },
  operations: { status: 'degraded', dbLatencyMs: 2400 },
  deployments: {
    current: {
      status: 'failure',
      branch: 'claude/a-very-long-branch-name-for-the-release-day-router',
      url: null,
    },
  },
  reliability: { unresolvedSentryIssues24h: 1284, p95LatencyMs: 9120 },
  testing: {
    quarantine: { isValid: true, withinRetryBudget: false, activeCount: 412 },
  },
  aiOps: {
    counts: { blocked: 38, failed: 17 },
    mergeQueue: { openAgentPrs: 64 },
    blockers: [],
  },
  gbrain: { status: 'down' },
});

/** Long content: every exception at once wraps onto several rows. */
export const LongContentEveryException: Story = {
  args: { metrics: everythingWrong },
};

function RtlStrip(args: { readonly metrics: HudMetrics }) {
  return (
    <div dir='rtl' lang='ar'>
      <HudExceptionsStrip {...args} />
    </div>
  );
}

/** RTL: the chips flow from the right in a right-to-left container. */
export const RtlExceptions: Story = {
  args: { metrics: everythingWrong },
  render: RtlStrip,
};
