import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PricingCTA } from './PricingCTA';

const meta: Meta<typeof PricingCTA> = {
  title: 'Pricing/PricingCTA',
  component: PricingCTA,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof PricingCTA>;

export const Default: Story = {
  args: {
    onUpgrade: () => console.log('Upgrade clicked'),
    isLoading: false,
  },
  decorators: [
    Story => (
      <div className='w-[600px]'>
        <Story />
      </div>
    ),
  ],
};

export const Loading: Story = {
  args: {
    onUpgrade: () => console.log('Upgrade clicked'),
    isLoading: true,
  },
  decorators: [
    Story => (
      <div className='w-[600px]'>
        <Story />
      </div>
    ),
  ],
};
