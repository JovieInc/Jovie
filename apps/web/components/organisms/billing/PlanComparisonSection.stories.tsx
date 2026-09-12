import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { PlanComparisonSection } from './PlanComparisonSection';

const meta = {
  title: 'Billing/PlanComparisonSection',
  component: PlanComparisonSection,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof PlanComparisonSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const pricingOptions = [
  {
    priceId: 'price_pro_month',
    amount: 3900,
    currency: 'usd',
    interval: 'month',
    description: 'Pro monthly',
  },
  {
    priceId: 'price_pro_year',
    amount: 37500,
    currency: 'usd',
    interval: 'year',
    description: 'Pro annual',
  },
];

export const Default: Story = {
  args: {
    pricingOptions,
    currentPlan: null,
    defaultPriceId: 'price_pro_month',
  },
};

export const CurrentPlanPro: Story = {
  args: {
    pricingOptions,
    currentPlan: 'pro',
    defaultPriceId: 'price_pro_month',
  },
};
