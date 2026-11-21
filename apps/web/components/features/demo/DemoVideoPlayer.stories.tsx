import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoVideoPlayer } from './DemoVideoPlayer';

const meta = {
  title: 'Features/Demo/DemoVideoPlayer',
  component: DemoVideoPlayer,
  parameters: {
    layout: 'centered',
  },
  args: {
    videoUrl: '/demo/jovie-demo.mp4',
    posterUrl: '/demo/jovie-demo-poster.png',
  },
} satisfies Meta<typeof DemoVideoPlayer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
