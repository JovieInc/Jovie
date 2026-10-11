import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { cockpitShipping } from '@/tests/fixtures/hud-cockpit';
import { HudShippingStrip } from './HudShippingStrip';

const meta = {
  title: 'Features/Admin/Hud/HudShippingStrip',
  component: HudShippingStrip,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof HudShippingStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { view: cockpitShipping } };
