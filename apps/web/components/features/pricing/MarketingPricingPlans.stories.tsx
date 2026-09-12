import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { MarketingPricingPlans } from './MarketingPricingPlans';

const meta = {
  title: 'Pricing/MarketingPricingPlans',
  component: MarketingPricingPlans,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof MarketingPricingPlans>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TierCardsNeutral: Story = {
  args: {
    variant: 'tier-cards-neutral',
  },
};

export const TierCardsRecommendedExpanded: Story = {
  args: {
    variant: 'tier-cards-recommended',
    mode: 'expanded',
  },
};
