import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { MarketingPricingPlans } from '@/components/features/pricing/MarketingPricingPlans';
import { PricingComparisonChart } from '@/features/pricing/PricingComparisonChart';
import { PricingRecipeBody } from './PricingRecipeBody';

/**
 * State coverage for the production pricing body. The canonical
 * recipe.pricing story stays alone in PricingRecipeBody.stories.tsx; these
 * render the same body with the same plan and comparison slots and change only
 * the caller-owned closing copy or the document direction.
 */
const meta = {
  title: 'Marketing/Recipes/PricingProductionStates',
  component: PricingRecipeBody,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    requestAccessCopy: '',
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

const LONG_CLOSING_COPY =
  'Start free with a profile that stays yours, then upgrade whenever you are ready. This deliberately long closing line runs to several lines so the section can be checked for clean wrapping at every width.';

/** Long content: closing copy several lines long wraps inside the section. */
export const LongContentClosingCopy: Story = {
  args: { requestAccessCopy: LONG_CLOSING_COPY },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(LONG_CLOSING_COPY)).toBeVisible();
    const closing = canvas.getByTestId('marketing-section-cta');
    await expect(within(closing).getAllByRole('link')).toHaveLength(1);
  },
};

/** Right-to-left: the full pricing body inside an RTL document. */
export const RtlDocument: Story = {
  args: {
    requestAccessCopy: 'ابدأ مجانًا وانتقل إلى خطة أعلى متى شئت.',
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { level: 1, name: 'Pricing' })
    ).toBeVisible();
    await expect(
      canvas.getByText('ابدأ مجانًا وانتقل إلى خطة أعلى متى شئت.')
    ).toBeVisible();
  },
};
