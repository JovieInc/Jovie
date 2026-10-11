import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { cockpitMetrics, cockpitShipping } from '@/tests/fixtures/hud-cockpit';
import { HudCompanyMetricCards } from './HudCompanyMetricCards';

const meta = {
  title: 'Features/Admin/Hud/HudCompanyMetricCards',
  component: HudCompanyMetricCards,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudCompanyMetricCards>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { metrics: cockpitMetrics(), shipping: cockpitShipping },
};
