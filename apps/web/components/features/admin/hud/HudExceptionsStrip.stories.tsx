import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { cockpitMetrics } from '@/tests/fixtures/hud-cockpit';
import { HudExceptionsStrip } from './HudExceptionsStrip';

const meta = {
  title: 'Features/Admin/Hud/HudExceptionsStrip',
  component: HudExceptionsStrip,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudExceptionsStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Nominal: Story = { args: { metrics: cockpitMetrics() } };

export const Degraded: Story = {
  args: {
    metrics: cockpitMetrics({
      operations: { status: 'degraded', dbLatencyMs: 240 },
    }),
  },
};
