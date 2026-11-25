import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { LyricsTimeline } from './LyricsTimeline';

function Frame(Story: () => ReactNode) {
  return (
    <div className='w-full max-w-2xl bg-base'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='w-full max-w-2xl bg-base'>
      <Story />
    </div>
  );
}

const manyLines = Array.from({ length: 60 }, (_, i) => ({
  startSec: i * 3,
  text: `Line ${i + 1}`,
}));

/**
 * State coverage for the lyrics timeline. The canonical story stays in
 * LyricsTimeline.stories.tsx; these show a track with no lyric lines, a
 * crowded cue row and the document direction.
 */
const meta = {
  title: 'Shell/LyricsTimeline States',
  component: LyricsTimeline,
  parameters: { layout: 'centered' },
  decorators: [Frame],
  args: {
    durationSec: 180,
    currentTimeSec: 42,
    lines: [],
    activeIndex: -1,
    onSeek: fn(),
  },
} satisfies Meta<typeof LyricsTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no lyric lines, so the bar shows only the playhead. */
export const EmptyNoLines: Story = {};

/** Many: sixty cue dots share one bar. */
export const ManyCues: Story = {
  args: { lines: manyLines, activeIndex: 14 },
};

/** Rtl: the bar follows the document direction. */
export const RtlDirection: Story = {
  decorators: [RtlFrame],
  args: { lines: manyLines.slice(0, 6), activeIndex: 2 },
};
