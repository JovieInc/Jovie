import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingElectricSeam } from './MarketingElectricSeam';

const meta: Meta<typeof MarketingElectricSeam> = {
  title: 'Marketing/Primitives/MarketingElectricSeam',
  component: MarketingElectricSeam,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-base px-8 py-20 text-primary-token'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Animated: Story = {
  args: { idSeed: 'storybook-seam' },
};

export const StaticGlow: Story = {
  args: { idSeed: 'storybook-static-seam', spark: false },
};
