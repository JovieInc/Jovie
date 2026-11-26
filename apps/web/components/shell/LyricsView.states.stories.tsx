import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fn } from 'storybook/test';
import { LyricsView } from './LyricsView';

function Frame(Story: () => ReactNode) {
  return (
    <div className='h-96 w-full max-w-2xl bg-base'>
      <Story />
    </div>
  );
}

function RtlFrame(Story: () => ReactNode) {
  return (
    <div dir='rtl' className='h-96 w-full max-w-2xl bg-base'>
      <Story />
    </div>
  );
}

const lines = Array.from({ length: 40 }, (_, i) => ({
  startSec: i * 5,
  text: `Sunlight through the skyline glass, line ${i + 1} of the song`,
}));

/**
 * State coverage for the lyrics view. The canonical stories stay in
 * LyricsView.stories.tsx; these show untimed lyrics, a long list and the
 * document direction.
 */
const meta = {
  title: 'Shell/LyricsView States',
  component: LyricsView,
  parameters: { layout: 'centered' },
  decorators: [Frame],
  args: {
    track: { title: 'Skyline Dreams', artist: 'Jovie Artist' },
    durationSec: 210,
    currentTimeSec: 42,
    lines: lines.slice(0, 3),
    onSeek: fn(),
  },
} satisfies Meta<typeof LyricsView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: lyrics exist but carry no timings yet. */
export const PartialUntimed: Story = { args: { timed: false } };

/** Long content: forty lines scroll inside the view. */
export const LongContentLines: Story = { args: { lines } };

/** Rtl: the view follows the document direction. */
export const RtlDirection: Story = { decorators: [RtlFrame] };
