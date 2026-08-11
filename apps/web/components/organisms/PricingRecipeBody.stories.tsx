import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import { getVisibleMarketingPricingPlans } from '@/data/marketingPricingPlans';
import { PricingComparisonChart } from '@/features/pricing/PricingComparisonChart';
import { PricingRecipeBody } from './PricingRecipeBody';

const visiblePaidPlans = getVisibleMarketingPricingPlans().filter(
  plan => plan.id !== 'free'
);
const primaryPaidPlanName =
  visiblePaidPlans.length === 1 ? visiblePaidPlans[0]?.name : null;

export const PRICING_RECIPE_STORY_REQUEST_ACCESS_COPY = primaryPaidPlanName
  ? `Claim the profile first. Choose ${primaryPaidPlanName} when you want the release system turned on.`
  : 'Claim the profile first. Choose a paid plan when you want the release system turned on.';

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
      sourceSha: '0892cccf39d72c62890ad4bc797cfd6f2d651af6',
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
