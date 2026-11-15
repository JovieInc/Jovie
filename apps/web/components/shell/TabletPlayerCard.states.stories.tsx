import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { TabletPlayerCard } from './TabletPlayerCard';

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

const ARTWORK = 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork';

/** State coverage for the tablet now-playing card; Default and Light live in TabletPlayerCard.stories.tsx. */
const meta = {
  title: 'Shell/TabletPlayerCard States',
  component: TabletPlayerCard,
  parameters: { layout: 'centered' },
  args: {
    isPlaying: false,
    currentTime: 48,
    duration: 213,
    onPlay: fn(),
    onPrevious: fn(),
    onNext: fn(),
    track: {
      trackTitle: 'Never Say A Word',
      artistName: 'Tim White',
      artworkUrl: ARTWORK,
    },
  },
} satisfies Meta<typeof TabletPlayerCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: nothing is playing, so no card renders. */
export const EmptyNothingPlaying: Story = {
  args: { track: { trackTitle: '', artistName: '', artworkUrl: '' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button')).toBeNull();
  },
};

/** Partial: a title with no artwork or artist, and an unknown duration. */
export const PartialNoArtwork: Story = {
  args: {
    duration: Number.NaN,
    onPrevious: undefined,
    onNext: undefined,
    track: { trackTitle: 'Untitled demo', artistName: null, artworkUrl: null },
  },
};

/** Long content: a long title and artist with an hour-scale duration. */
export const LongContentLongTrack: Story = {
  args: {
    isPlaying: true,
    currentTime: 2412,
    duration: 3725,
    track: {
      trackTitle:
        'A Very Long Extended Club Mix Title (Original Version) [Remastered 2026]',
      artistName: 'The Extremely Long Collective Name featuring Many Guests',
      artworkUrl: ARTWORK,
    },
  },
};

/** Right-to-left: Arabic track copy in an RTL document. */
export const RtlArabic: Story = {
  args: {
    track: {
      trackTitle: 'لا تقل كلمة',
      artistName: 'تيم وايت',
      artworkUrl: ARTWORK,
    },
  },
  decorators: [rtl],
};
