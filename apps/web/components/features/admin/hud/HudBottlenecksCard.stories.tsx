import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { cockpitMetrics } from '@/tests/fixtures/hud-cockpit';
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
