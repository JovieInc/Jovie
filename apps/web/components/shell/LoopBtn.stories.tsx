import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { LoopBtn } from './LoopBtn';

const meta = {
  title: 'Shell/LoopBtn',
  component: LoopBtn,
  parameters: {
    layout: 'centered',
  },
  args: {
    onClick: fn(),
  },
} satisfies Meta<typeof LoopBtn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  args: {
    mode: 'off',
  },
};

export const LoopTrack: Story = {
  args: {
    mode: 'track',
  },
};

export const LoopSection: Story = {
  args: {
    mode: 'section',
  },
};
