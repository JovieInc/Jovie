import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LyricsTimeline } from './LyricsTimeline';

const meta = {
  title: 'Shell/LyricsTimeline',
  component: LyricsTimeline,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LyricsTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    durationSec: 210,
    currentTimeSec: 42,
    lines: [
      { startSec: 0, text: 'Sunlight through the skyline glass' },
      { startSec: 12, text: 'Nothing moves as fast as this' },
    ],
    activeIndex: 1,
    onSeek: () => {},
  },
};
