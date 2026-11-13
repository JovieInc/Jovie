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
  args: {
    mode: 'expanded',
    variant: 'tier-cards-recommended',
  },
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
  args: {
    mode: 'compact',
    variant: 'tier-cards-neutral',
  },
  render: () => (
    <div className='min-h-dvh bg-page px-4 py-10 md:px-8'>
      <div className='mx-auto max-w-6xl'>
        <MarketingPricingPlans mode='compact' variant='tier-cards-neutral' />
      </div>
    </div>
  ),
};

/**
 * Partial: Free and the custom plan carry no cadence, and the custom plan has
 * no feature list, so their cards drop those rows and keep the CTA aligned.
 */
export const PartialPlanDetails: Story = {
  args: {
    mode: 'expanded',
    variant: 'tier-cards-neutral',
  },
  render: () => (
    <div className='min-h-dvh bg-page px-4 py-10 md:px-8'>
      <div className='mx-auto max-w-6xl'>
        <MarketingPricingPlans mode='expanded' variant='tier-cards-neutral' />
      </div>
    </div>
  ),
};

/** Long content: the longest plan copy and CTA wrapped in a phone-width column. */
export const LongContentNarrowColumn: Story = {
  args: {
    mode: 'compact',
    variant: 'tier-cards-recommended',
  },
  render: () => (
    <div className='min-h-dvh bg-page px-4 py-10'>
      <div className='mx-auto w-80'>
        <MarketingPricingPlans
          mode='compact'
          variant='tier-cards-recommended'
        />
      </div>
    </div>
  ),
};

/** Right-to-left: the plan cards inside an Arabic document direction. */
export const RtlDocument: Story = {
  args: {
    mode: 'expanded',
    variant: 'tier-cards-recommended',
  },
  render: () => (
    <div dir='rtl' lang='ar' className='min-h-dvh bg-page px-4 py-10 md:px-8'>
      <div className='mx-auto max-w-6xl'>
        <MarketingPricingPlans
          mode='expanded'
          variant='tier-cards-recommended'
        />
      </div>
    </div>
  ),
};
