import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ThreadAudioCard } from './ThreadAudioCard';

const meta = {
  title: 'Shell/ThreadAudioCard',
  component: ThreadAudioCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Lost in the Light',
    artist: 'Bahamas',
    duration: '3:33',
  },
} satisfies Meta<typeof ThreadAudioCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playable: Story = {
  args: {
    onPlay: fn(),
  },
};

export const NoHandler: Story = {
  args: {
    onPlay: undefined,
  },
};
