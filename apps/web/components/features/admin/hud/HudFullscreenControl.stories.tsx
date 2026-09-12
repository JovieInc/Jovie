import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HudFullscreenControl } from './HudFullscreenControl';

const meta = {
  title: 'Features/Admin/Hud/HudFullscreenControl',
  component: HudFullscreenControl,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HudFullscreenControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnterFullscreen: Story = {};

export const ExitFullscreen: Story = {
  args: {
    action: 'exit',
  },
};
