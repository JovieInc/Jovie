import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import { PricingComparisonChart } from '@/features/pricing/PricingComparisonChart';
import { getPublicPriceClaim } from '@/lib/billing/offer-truth';
import { PricingRecipeBody } from './PricingRecipeBody';

const proClaim = getPublicPriceClaim('pro');
export const PRICING_RECIPE_STORY_REQUEST_ACCESS_COPY = `Artist Visibility Pro is ${proClaim.priceLabel}/month with limited access. Request access.`;

const meta = {
  title: 'Marketing/Recipes/PricingProduction',
  component: PricingRecipeBody,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Exact shared production body for recipe.pricing. The /pricing route retains metadata, schema, and visible-plan data ownership; this story passes the same expanded plan presentation, comparison chart, and data-derived closing copy. No social proof or FAQ is added because the shipped zero-proof route omits them.',
      },
    },
    pen: {
      registryId: 'recipe.pricing',
      route: '/pricing',
      source: 'apps/web/components/organisms/PricingRecipeBody.tsx',
      sourceSha: '00895196e53b823bb0311193b4af29f67b8849c1',
      fixture: 'production-visible-pricing-plans',
      omissions: ['logo-cloud', 'social-proof', 'faq'],
    },
  },
  tags: ['autodocs'],
  args: {
    requestAccessCopy: PRICING_RECIPE_STORY_REQUEST_ACCESS_COPY,
    plans: null,
    comparisonChart: null,
  },
  render: args => (
    <PricingRecipeBody
      {...args}
      plans={
        <MarketingPricingPlans mode='expanded' variant='tier-cards-neutral' />
      }
      comparisonChart={<PricingComparisonChart />}
    />
  ),
} satisfies Meta<typeof PricingRecipeBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pricing: Story = {
  name: 'recipe.pricing /pricing',
};
