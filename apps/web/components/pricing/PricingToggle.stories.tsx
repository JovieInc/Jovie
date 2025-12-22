import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PricingToggle } from './PricingToggle';

const meta: Meta<typeof PricingToggle> = {
  title: 'Pricing/PricingToggle',
  component: PricingToggle,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof PricingToggle>;

export const Default: Story = {
  args: {
    onChange: isYearly => console.log('Yearly:', isYearly),
  },
};

export const InContext: Story = {
  render: () => (
    <div className='text-center space-y-4'>
      <h2 className='text-2xl font-bold'>Choose your plan</h2>
      <PricingToggle onChange={isYearly => console.log('Yearly:', isYearly)} />
      <p className='text-sm text-secondary'>Save 17% with yearly billing</p>
    </div>
  ),
};
