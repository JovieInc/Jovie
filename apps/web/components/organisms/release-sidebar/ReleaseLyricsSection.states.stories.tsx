import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ReleaseLyricsSection } from './ReleaseLyricsSection';

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseLyricsSection/States',
  component: ReleaseLyricsSection,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-96'>
        <Story />
      </div>
    ),
  ],
  args: {
    releaseId: 'release-1',
    lyrics: 'Verse one\nDriving through the midnight glow\n',
    isEditable: true,
    onSaveLyrics: fn(() => Promise.resolve()),
    onFormatLyrics: fn(() => Promise.resolve([])),
  },
} satisfies Meta<typeof ReleaseLyricsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: editable but with no format handler, so only Copy shows. */
export const PartialNoFormatter: Story = {
  args: { onFormatLyrics: undefined },
};

/** Long content: a long lyric sheet that fills the resizable textarea. */
export const LongContentLyrics: Story = {
  args: {
    lyrics: Array.from(
      { length: 40 },
      (_, index) =>
        `Line ${index + 1}: driving through the midnight glow with nowhere left to go`
    ).join('\n'),
  },
};
