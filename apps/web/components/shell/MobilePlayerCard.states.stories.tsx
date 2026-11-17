import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { MobilePlayerCard } from './MobilePlayerCard';

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** State coverage for the phone now-playing card; Default and Light live in MobilePlayerCard.stories.tsx. */
const meta = {
  title: 'Shell/MobilePlayerCard States',
  component: MobilePlayerCard,
  parameters: { layout: 'centered' },
  args: {
    isPlaying: false,
    pct: 20,
    onPlay: fn(),
    track: {
      trackTitle: 'Never Say A Word',
      artistName: 'Tim White',
      artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    },
  },
} satisfies Meta<typeof MobilePlayerCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: with no title and no artwork nothing is playing, so no card renders. */
export const EmptyNothingPlaying: Story = {
  args: { track: { trackTitle: '', artistName: '', artworkUrl: '' } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button')).toBeNull();
  },
};

/** Long content: a long title and artist truncate beside the play button. */
export const LongContentTruncated: Story = {
  args: {
    isPlaying: true,
    pct: 64,
    track: {
      trackTitle:
        'A Very Long Extended Club Mix Title (Original Version) [Remastered 2026]',
      artistName: 'The Extremely Long Collective Name featuring Many Guests',
      artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    },
  },
};

/** Right-to-left: Arabic track copy in an RTL document. */
export const RtlArabic: Story = {
  args: {
    track: {
      trackTitle: 'لا تقل كلمة',
      artistName: 'تيم وايت',
      artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    },
  },
  decorators: [rtl],
};
