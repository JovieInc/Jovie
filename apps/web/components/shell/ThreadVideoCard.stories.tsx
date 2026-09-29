import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ThreadVideoCard } from './ThreadVideoCard';

const meta = {
  title: 'Shell/ThreadVideoCard',
  component: ThreadVideoCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    title: 'Lyric video — Midnight Drive',
    durationSec: 187,
  },
} satisfies Meta<typeof ThreadVideoCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Interactive: Story = {
  args: {
    onPlay: () => {},
    onFullscreen: () => {},
  },
};

export const PlayOnly: Story = {
  args: {
    onPlay: () => {},
  },
};

export const Disabled: Story = {};
