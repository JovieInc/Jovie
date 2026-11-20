import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { LyricsHeader } from './LyricsHeader';

const column: Decorator = function LyricsColumn(Story) {
  return (
    <div className='w-80 bg-base'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-80 bg-base'>
      <Story />
    </div>
  );
};

/** State coverage for the lyrics breadcrumb; Default lives in LyricsHeader.stories.tsx. */
const meta = {
  title: 'Shell/LyricsHeader States',
  component: LyricsHeader,
  parameters: { layout: 'centered' },
  decorators: [column],
  args: {
    track: { title: 'Skyline Dreams', artist: 'Jovie Artist' },
    onArtistClick: fn(),
  },
} satisfies Meta<typeof LyricsHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a track with no artist name reads Unknown artist on the link. */
export const EmptyUnknownArtist: Story = {
  args: { track: { title: 'Skyline Dreams', artist: '' } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Unknown artist' })
    );
    await expect(args.onArtistClick).toHaveBeenCalledOnce();
  },
};

/** Partial: no artist click handler, so the artist renders as plain text. */
export const PartialPlainArtist: Story = {
  args: { onArtistClick: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button')).toBeNull();
  },
};

/** Long content: long artist and title truncate on one line. */
export const LongContentTruncated: Story = {
  args: {
    track: {
      artist: 'The Extremely Long Collective Name featuring Many Guests',
      title:
        'A Song Title So Long It Needs To Truncate Inside The Sticky Header',
    },
  },
};

/** Right-to-left: an Arabic breadcrumb in an RTL lyrics view. */
export const RtlArabic: Story = {
  args: { track: { artist: 'فيروز', title: 'أحلام الأفق' } },
  decorators: [rtl],
};
