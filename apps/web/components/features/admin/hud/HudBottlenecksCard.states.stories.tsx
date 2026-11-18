import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { cockpitMetrics } from '@/tests/fixtures/hud-cockpit';
import { HudBottlenecksCard } from './HudBottlenecksCard';

/** State coverage for the ranked bottlenecks card. */
const meta = {
  title: 'Features/Admin/Hud/HudBottlenecksCard States',
  component: HudBottlenecksCard,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudBottlenecksCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const LONG_BRANCH =
  'claude/ds-cert-admin-hud-state-stories-interaction-tests-and-axe-checks-for-every-component';

/** Empty: a healthy company has nothing measurably constraining it. */
export const EmptyNoBottlenecks: Story = {
  args: { metrics: cockpitMetrics() },
};

/** Long content: three ranked bottlenecks with long titles and details. */
export const LongContentRanked: Story = {
  args: {
    metrics: cockpitMetrics({
      deployments: {
        current: {
          status: 'failure',
          branch: LONG_BRANCH,
          url: 'https://vercel.com/jovie/web/deployments/1',
        },
      },
      aiOps: {
        counts: { blocked: 12, failed: 7 },
        mergeQueue: { openAgentPrs: 14 },
        blockers: [
          {
            summary:
              'The admin HUD migration is waiting on a schema review that has been open for several days and blocks three follow-up runs.',
            url: 'https://github.com/JovieInc/Jovie/pull/1',
          },
        ],
      },
      reliability: { unresolvedSentryIssues24h: 128, p95LatencyMs: 40 },
    }),
  },
};

/** Right-to-left: the ranked list inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    metrics: cockpitMetrics({
      deployments: { current: { status: 'failure', branch: 'main' } },
    }),
  },
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
