import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPricingPlans } from './MarketingPricingPlans';

const meta = {
  title: 'Pricing/MarketingPricingPlans',
  component: MarketingPricingPlans,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof MarketingPricingPlans>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TierCardsRecommended: Story = {
  render: () => (
    <div className='min-h-dvh bg-page px-4 py-10 md:px-8'>
      <div className='mx-auto max-w-6xl'>
        <MarketingPricingPlans
          mode='expanded'
          variant='tier-cards-recommended'
        />
      </div>
    </div>
  ),
};

export const TierCardsNeutral: Story = {
  render: () => (
    <div className='min-h-dvh bg-page px-4 py-10 md:px-8'>
      <div className='mx-auto max-w-6xl'>
        <MarketingPricingPlans mode='compact' variant='tier-cards-neutral' />
      </div>
    </div>
  ),
};
