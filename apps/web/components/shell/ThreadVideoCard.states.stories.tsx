import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { ThreadVideoCard } from './ThreadVideoCard';

const thread: Decorator = function ThreadColumn(Story) {
  return (
    <div className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

/** State coverage for the video card; Interactive, PlayOnly and Disabled live in ThreadVideoCard.stories.tsx. */
const meta = {
  title: 'Shell/ThreadVideoCard States',
  component: ThreadVideoCard,
  parameters: { layout: 'centered' },
  decorators: [thread],
  args: { title: 'Lyric video — Midnight Drive', durationSec: 187 },
} satisfies Meta<typeof ThreadVideoCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: only full-screen is wired, so the thumbnail stays non-interactive. */
export const PartialFullscreenOnly: Story = {
  args: { onFullscreen: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button', { name: /Play/ })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Fullscreen' }));
    await expect(args.onFullscreen).toHaveBeenCalledOnce();
  },
};

/** Long content: a long title and an hour-scale duration. */
export const LongContentLongTitle: Story = {
  args: {
    title:
      'Lyric video — Midnight Drive (Extended Club Mix featuring every guest vocalist) [Official Visualizer]',
    durationSec: 3725,
    onPlay: fn(),
    onFullscreen: fn(),
  },
};

/** Right-to-left: an Arabic title in an RTL thread. */
export const RtlArabic: Story = {
  args: { title: 'فيديو كلمات — قيادة منتصف الليل', onPlay: fn() },
  decorators: [rtl],
};
