import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingRoundedFrame } from './MarketingRoundedFrame';

export default {
  title: 'Marketing/Primitives/MarketingRoundedFrame',
  component: MarketingRoundedFrame,
} satisfies Meta<typeof MarketingRoundedFrame>;

export const EditorialCard: StoryObj<typeof MarketingRoundedFrame> = {
  args: { children: <div className='h-40 w-72 bg-surface-1' /> },
};
