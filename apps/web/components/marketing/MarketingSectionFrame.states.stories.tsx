import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingSectionFrame } from './MarketingSectionFrame';

/** Rendered states of the section frame; defaults live in MarketingSectionFrame.stories.tsx. */
const meta = {
  title: 'Marketing/Primitives/MarketingSectionFrame States',
  component: MarketingSectionFrame,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-base text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarketingSectionFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: no eyebrow, a single copy block and no reversed media. */
export const PartialNoEyebrow: Story = {
  args: {
    children: (
      <h2 className='marketing-h2-linear text-primary-token'>
        Your release work, connected.
      </h2>
    ),
  },
};

/** Long content: a long eyebrow and copy that wrap inside the landing width. */
export const LongContentCopy: Story = {
  args: {
    eyebrow: 'Inside Jovie, for every release, profile and fan signal',
    children: (
      <div>
        <h2 className='marketing-h2-linear text-primary-token'>
          Your release work, your profile and every fan signal, connected in one
          shared view.
        </h2>
        <p className='mt-4 max-w-xl text-mid leading-relaxed text-secondary-token'>
          Keep the next drop, the next fan, the next show and the next action in
          one shared view instead of scattering them across a stack of tools
          that never agree on what is live.
        </p>
      </div>
    ),
  },
};

/** Right-to-left: an Arabic eyebrow and copy in a reversed frame. */
export const RtlArabic: Story = {
  args: {
    eyebrow: 'داخل جوفي',
    reverse: true,
    children: (
      <h2 className='marketing-h2-linear text-primary-token'>
        عملك على الإصدار، متصل.
      </h2>
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
