import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MarketingOfferSummary } from './MarketingOfferSummary';

const meta = {
  title: 'Marketing/MarketingOfferSummary',
  component: MarketingOfferSummary,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Offer summary for marketing pages. Price, badge, and terms come from lib/billing/offer-truth.ts by plan id; the component has no price prop. Each inclusion names the PRICING_COMPARISON row that proves it.',
      },
    },
  },
  args: {
    plan: 'free',
    includedLabel: 'Included free',
    included: [
      {
        label: 'Public artist profile at jov.ie/you',
        entitlement: 'Public Jovie profile page',
      },
      { label: 'Unlimited smart links', entitlement: 'Unlimited smart links' },
      {
        label: 'Tour dates from Bandsintown',
        entitlement: 'Tour dates (Bandsintown)',
      },
    ],
  },
  decorators: [
    Story => (
      <div className='w-96 max-w-full'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarketingOfferSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Free: Story = {};

export const WithTerms: Story = {
  args: { showTerms: true },
};

export const WithoutTerms: Story = {
  args: { showTerms: false },
};
