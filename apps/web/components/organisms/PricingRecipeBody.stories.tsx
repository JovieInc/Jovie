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
          'Exact shared production body for recipe.pricing. The route retains schema and visible-plan data ownership; the body composes the plan cards, experience bar, comparison, truthful founder proof, FAQ, and close.',
      },
    },
    pen: {
      registryId: 'recipe.pricing',
      route: '/pricing',
      source: 'apps/web/components/organisms/PricingRecipeBody.tsx',
      sourceSha: '00895196e53b823bb0311193b4af29f67b8849c1',
      fixture: 'production-visible-pricing-plans',
      omissions: [],
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
