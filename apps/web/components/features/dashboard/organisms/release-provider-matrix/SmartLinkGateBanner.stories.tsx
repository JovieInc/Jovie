import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { queryKeys } from '@/lib/queries/keys';
import type { BillingStatusData } from '@/lib/queries/useBillingStatusQuery';
import { SmartLinkGateBanner } from './SmartLinkGateBanner';

const freeBilling: BillingStatusData = {
  isPro: false,
  plan: 'free',
  hasStripeCustomer: false,
  stripeSubscriptionId: null,
  stale: false,
  staleReason: null,
  trialStartedAt: null,
  trialEndsAt: null,
  trialNotificationsSent: 0,
};

function BillingStoryShell({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });
  queryClient.setQueryData(queryKeys.billing.status(), freeBilling);
  return (
    <QueryClientProvider client={queryClient}>
      <div className='max-w-md'>{children}</div>
    </QueryClientProvider>
  );
}

const meta = {
  title: 'Dashboard/Organisms/ReleaseProviderMatrix/SmartLinkGateBanner',
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <BillingStoryShell>
        <Story />
      </BillingStoryShell>
    ),
  ],
} satisfies Meta<typeof SmartLinkGateBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SoftCap: Story = {
  render: () => (
    <SmartLinkGateBanner mode='soft-cap' releasedCount={104} softCap={100} />
  ),
};

export const Unreleased: Story = {
  render: () => <SmartLinkGateBanner mode='unreleased' unreleasedCount={3} />,
};
