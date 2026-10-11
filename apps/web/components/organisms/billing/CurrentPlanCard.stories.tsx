import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { BillingStatusData } from '@/lib/queries';
import { CurrentPlanCard } from './CurrentPlanCard';

const proBilling: BillingStatusData = {
  isPro: true,
  plan: 'pro',
  hasStripeCustomer: true,
  stripeSubscriptionId: 'sub_123',
  stale: false,
  staleReason: null,
  trialStartedAt: null,
  trialEndsAt: null,
  trialNotificationsSent: 0,
};

function QueryProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Organisms/Billing/CurrentPlanCard',
  component: CurrentPlanCard,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <QueryProvider>
        <Story />
      </QueryProvider>
    ),
  ],
  args: {
    billingInfo: proBilling,
    defaultPriceId: 'price_123',
  },
} satisfies Meta<typeof CurrentPlanCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pro: Story = {};

export const Free: Story = {
  args: {
    billingInfo: { ...proBilling, isPro: false, plan: null },
  },
};
