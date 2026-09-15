import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPricingPlans } from './MarketingPricingPlans';

const meta = {
  title: 'Pricing/MarketingPricingPlans',
  component: MarketingPricingPlans,
  parameters: { layout: 'fullscreen' },
  args: { mode: 'expanded', variant: 'tier-cards-neutral' },
  render: args => (
    <div className='bg-page px-4 py-10 md:px-8'>
      <MarketingPricingPlans {...args} />
    </div>
  ),
} satisfies Meta<typeof MarketingPricingPlans>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const Compact: Story = { args: { mode: 'compact' } };
export const Recommended: Story = {
  args: { variant: 'tier-cards-recommended' },
};
