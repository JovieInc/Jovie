import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { ThreadTurn } from './ThreadTurn';

const thread: Decorator = function ThreadColumn(Story) {
  return (
    <div className='w-80 space-y-2 bg-base p-3'>
      <Story />
    </div>
  );
};

const rtl: Decorator = function RtlFrame(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-80 space-y-2 bg-base p-3'>
      <Story />
    </div>
  );
};

/** State coverage for a thread turn; FromJovie, FromMe and Subtle live in ThreadTurn.stories.tsx. */
const meta = {
  title: 'Shell/ThreadTurn States',
  component: ThreadTurn,
  parameters: { layout: 'centered' },
  decorators: [thread],
  args: { speaker: 'me', children: 'Show me my top tracks' },
} satisfies Meta<typeof ThreadTurn>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long user message and an unbroken URL wrap inside the bubble. */
export const LongContentWrappedBubble: Story = {
  args: {
    children:
      'Can you pull together every playlist add from the last ninety days, group them by curator and territory, and flag the ones that came from editorial teams? Here is the link I used: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=averyveryverylongsharetoken',
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/every playlist add/).parentElement
    ).toHaveClass('justify-end');
  },
};

/** Right-to-left: an Arabic user bubble in an RTL thread. */
export const RtlArabic: Story = {
  args: { children: 'أرني أفضل مقاطعي' },
  decorators: [rtl],
};
