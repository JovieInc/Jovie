import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queries/keys';
import type { BillingStatusData } from '@/lib/queries/useBillingStatusQuery';
import { SettingsBillingSection } from './SettingsBillingSection';

const baseBilling: BillingStatusData = {
  isPro: true,
  plan: 'pro',
  hasStripeCustomer: true,
  stripeSubscriptionId: 'sub_story',
  stale: false,
  staleReason: null,
  trialStartedAt: null,
  trialEndsAt: null,
  trialNotificationsSent: 0,
};

function BillingStoryShell({
  billing,
  children,
}: {
  readonly billing: BillingStatusData;
  readonly children: ReactNode;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      },
    },
  });
  queryClient.setQueryData(queryKeys.billing.status(), billing);

  return (
    <QueryClientProvider client={queryClient}>
      <div className='w-xl max-w-full bg-base p-4 text-primary-token'>
        {children}
      </div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Dashboard/SettingsBillingSection',
  component: SettingsBillingSection,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SettingsBillingSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {
  decorators: [
    Story => (
      <BillingStoryShell billing={baseBilling}>
        <Story />
      </BillingStoryShell>
    ),
  ],
};

export const CachedWithWarning: Story = {
  decorators: [
    Story => (
      <BillingStoryShell
        billing={{
          ...baseBilling,
          stale: true,
          staleReason: 'Payment service temporarily unavailable',
        }}
      >
        <Story />
      </BillingStoryShell>
    ),
  ],
};

export const Free: Story = {
  decorators: [
    Story => (
      <BillingStoryShell
        billing={{
          ...baseBilling,
          isPro: false,
          plan: 'free',
          hasStripeCustomer: false,
          stripeSubscriptionId: null,
        }}
      >
        <Story />
      </BillingStoryShell>
    ),
  ],
};
