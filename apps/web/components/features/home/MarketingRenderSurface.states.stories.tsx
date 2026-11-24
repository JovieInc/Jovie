import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingRenderSurface } from './MarketingRenderSurface';

const meta = {
  title: 'Features/Home/MarketingRenderSurface/States',
  component: MarketingRenderSurface,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
  },
  decorators: [
    function WidthDecorator(Story) {
      return (
        <div className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof MarketingRenderSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: the tips drawer crop shows a cropped part of the profile. */
export const PartialTipsCrop: Story = {
  args: { surfaceId: 'tips' },
};

/** Long content: the countdown surface stacks two profile crops. */
export const LongContentCountdown: Story = {
  args: { surfaceId: 'countdown' },
};

/** Right to left: the surface under an Arabic document direction. */
export const RtlOverflow: Story = {
  args: { surfaceId: 'notification' },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar' className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
};
