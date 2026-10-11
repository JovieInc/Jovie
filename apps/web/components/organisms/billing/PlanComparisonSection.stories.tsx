import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PricingOption } from '@/lib/queries';
import { PlanComparisonSection } from './PlanComparisonSection';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const pricingOptions: PricingOption[] = [
  {
    priceId: 'price_pro_monthly',
    amount: 1900,
    currency: 'usd',
    interval: 'month',
    description: 'Pro monthly plan',
  },
  {
    priceId: 'price_max_monthly',
    amount: 4900,
    currency: 'usd',
    interval: 'month',
    description: 'Max monthly plan',
  },
];

const meta = {
  title: 'Organisms/Billing/PlanComparisonSection',
  component: PlanComparisonSection,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <QueryClientProvider client={queryClient}>
        <div className='w-full max-w-4xl'>
          <Story />
        </div>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof PlanComparisonSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FreePlan: Story = {
  args: {
    pricingOptions,
    currentPlan: 'free',
    defaultPriceId: 'price_pro_monthly',
  },
};

export const ProPlan: Story = {
  args: {
    pricingOptions,
    currentPlan: 'pro',
    defaultPriceId: 'price_pro_monthly',
  },
};

export const NoPricing: Story = {
  args: {
    pricingOptions: [],
    currentPlan: null,
    defaultPriceId: undefined,
  },
};
