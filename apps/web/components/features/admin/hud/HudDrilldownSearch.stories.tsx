import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { cockpitMetrics } from '@/tests/fixtures/hud-cockpit';
import { HudDrilldownSearch } from './HudDrilldownSearch';

const meta = {
  title: 'Features/Admin/Hud/HudDrilldownSearch',
  component: HudDrilldownSearch,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudDrilldownSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Nominal: Story = { args: { metrics: cockpitMetrics() } };

export const WithExceptions: Story = {
  args: {
    metrics: cockpitMetrics({
      operations: { status: 'degraded', dbLatencyMs: 240 },
    }),
  },
};
