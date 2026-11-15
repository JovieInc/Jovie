import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingRoundedFrame } from './MarketingRoundedFrame';

/** Rendered states of the rounded frame; the default lives in MarketingRoundedFrame.stories.tsx. */
const meta = {
  title: 'Marketing/Primitives/MarketingRoundedFrame States',
  component: MarketingRoundedFrame,
  args: { children: null },
} satisfies Meta<typeof MarketingRoundedFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: a long caption that must wrap inside the clipped frame. */
export const LongContentCaption: Story = {
  args: {
    className: 'w-72',
    children: (
      <figure aria-label='Profile preview' className='bg-surface-1 p-4'>
        <figcaption className='text-sm text-secondary-token'>
          A direct connection with every listener who opens your profile, from
          the first release to the show they buy tickets for after it.
        </figcaption>
      </figure>
    ),
  },
};

/** Right-to-left: an Arabic caption in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    className: 'w-72',
    children: (
      <figure aria-label='معاينة الملف' className='bg-surface-1 p-4'>
        <figcaption className='text-sm text-secondary-token'>
          اتصال مباشر مع كل مستمع.
        </figcaption>
      </figure>
    ),
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
