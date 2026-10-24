import { pipelineBottleneckSchema } from '@jovie/agent-transport-contracts/pipeline-bottleneck';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { cockpitMetrics } from '@/tests/fixtures/hud-cockpit';
import {
  goldenPathSentry,
  legacyBottleneckState,
} from '@/tests/fixtures/pipeline-bottleneck';
import { HudBottlenecksCard } from './HudBottlenecksCard';

const meta = {
  title: 'Features/Admin/Hud/HudBottlenecksCard',
  component: HudBottlenecksCard,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudBottlenecksCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DeployFailing: Story = {
  args: {
    metrics: cockpitMetrics({
      deployments: { current: { status: 'failure', branch: 'main' } },
    }),
  },
};

export const GoldenPathRegression: Story = {
  args: {
    metrics: {
      ...cockpitMetrics({
        deployments: { current: { status: 'failure', branch: 'main' } },
      }),
      pipelineBottleneck: pipelineBottleneckSchema.parse({
        ...legacyBottleneckState,
        golden_path_sentry: goldenPathSentry,
      }),
    },
  },
};

export const Unmeasured: Story = { args: { metrics: cockpitMetrics() } };
