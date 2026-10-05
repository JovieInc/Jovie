import '@/app/globals.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import cashBandMeta from './HudCashMrrBand.stories';
import { HudSystemHealthStrip } from './HudSystemHealthStrip';

const meta = {
  title: 'Features/Admin/Hud/HudSystemHealthStrip',
  component: HudSystemHealthStrip,
  args: { metrics: cashBandMeta.args.metrics },
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HudSystemHealthStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Standalone: Story = { args: { presentation: 'page' } };
