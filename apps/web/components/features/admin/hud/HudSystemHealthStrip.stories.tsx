import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HudSystemHealthStrip } from './HudSystemHealthStrip';

const meta = {
  title: 'Features/Admin/Hud/HudSystemHealthStrip',
  component: HudSystemHealthStrip,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HudSystemHealthStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
