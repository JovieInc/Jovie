import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LyricsRouteSkeleton } from './LyricsRouteSkeleton';

const meta = {
  title: 'Shell/LyricsRouteSkeleton',
  component: LyricsRouteSkeleton,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof LyricsRouteSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The skeleton is the lyrics route's loading state. */
export const LoadingLyrics: Story = {
  decorators: [
    Story => (
      <div className='h-120 w-160'>
        <Story />
      </div>
    ),
  ],
};

export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar' className='h-120 w-160'>
        <Story />
      </div>
    ),
  ],
};
