import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { YouTubeEmbed } from './YouTubeEmbed';

const meta = {
  title: 'Features/Release/YouTubeEmbed',
  component: YouTubeEmbed,
  parameters: {
    layout: 'centered',
  },
  args: {
    // A stable, always-available public video id (youtube-nocookie embed).
    videoId: 'dQw4w9WgXcQ',
    title: 'Music video preview',
  },
} satisfies Meta<typeof YouTubeEmbed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
