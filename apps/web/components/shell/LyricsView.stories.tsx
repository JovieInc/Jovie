import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LyricsView } from './LyricsView';

const meta = {
  title: 'Shell/LyricsView',
  component: LyricsView,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LyricsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    track: { title: 'Skyline Dreams', artist: 'Jovie Artist' },
    durationSec: 210,
    currentTimeSec: 42,
    lines: [
      { startSec: 0, text: 'Sunlight through the skyline glass' },
      { startSec: 12, text: 'Nothing moves as fast as this' },
    ],
    onSeek: () => {},
  },
};
