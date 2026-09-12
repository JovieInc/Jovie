import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AudioPlayButton } from './AudioPlayButton';

const meta = {
  title: 'Shell/AudioPlayButton',
  component: AudioPlayButton,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['disabled'] },
  },
  args: {
    isPlaying: false,
    onClick: fn(),
  },
} satisfies Meta<typeof AudioPlayButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Play: Story = {};

export const Pause: Story = {
  args: { isPlaying: true },
};

export const Loading: Story = {
  args: { isLoading: true },
};

export const Persistent: Story = {
  args: { size: 'persistent' },
};
