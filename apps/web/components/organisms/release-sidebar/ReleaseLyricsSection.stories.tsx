import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { ReleaseLyricsSection } from './ReleaseLyricsSection';

const meta = {
  title: 'Organisms/ReleaseSidebar/ReleaseLyricsSection',
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

export const Default: Story = {};

export const Empty: Story = {
  args: {
    lyrics: '',
  },
};

export const ReadOnly: Story = {
  args: {
    isEditable: false,
  },
};

export const Saving: Story = {
  args: {
    isSaving: true,
  },
};
