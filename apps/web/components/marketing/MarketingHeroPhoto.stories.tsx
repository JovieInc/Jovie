import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingHeroPhoto } from './MarketingHeroPhoto';

const meta: Meta<typeof MarketingHeroPhoto> = {
  title: 'Marketing/MarketingHeroPhoto',
  component: MarketingHeroPhoto,
  parameters: { layout: 'fullscreen' },
  args: {
    src: '/images/marketing-hero/product.webp',
    width: 1600,
    height: 901,
  },
  decorators: [
    Story => (
      <div className='dark relative h-96 overflow-hidden bg-base'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof MarketingHeroPhoto>;

export const FullStrength: Story = {};

export const Dimmed: Story = {
  args: {
    src: '/images/marketing-hero/ai.webp',
    height: 1067,
    opacity: 0.2,
  },
};
