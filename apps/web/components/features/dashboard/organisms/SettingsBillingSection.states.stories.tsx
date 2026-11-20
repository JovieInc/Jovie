import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, waitFor, within } from 'storybook/test';
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
  unavailable,
}: {
  readonly billing: BillingStatusData | null;
  readonly children: ReactNode;
  readonly unavailable?: 'error' | 'retrying';
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryOnMount: false,
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      },
    },
  });
  if (billing) {
    queryClient.setQueryData(queryKeys.billing.status(), billing);
  } else if (!unavailable) {
    // A never-settling in-flight fetch keeps the query's isLoading true.
    void queryClient.prefetchQuery({
      queryKey: queryKeys.billing.status(),
      queryFn: () => new Promise<BillingStatusData>(() => {}),
    });
  }

  if (unavailable) {
    queryClient
      .getQueryCache()
      .build<BillingStatusData, Error>(queryClient, {
        queryKey: queryKeys.billing.status(),
      })
      .setState({
        status: 'error',
        error: new Error('Billing status could not be loaded'),
        fetchStatus: unavailable === 'retrying' ? 'fetching' : 'idle',
      });
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className='w-xl max-w-full bg-base p-4 text-primary-token'>
        {children}
      </div>
    </QueryClientProvider>
  );
}

/** State coverage for the billing settings row; same query seeding as the base stories. */
const meta = {
  title: 'Features/Dashboard/SettingsBillingSection States',
  component: SettingsBillingSection,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SettingsBillingSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no subscription and no Stripe customer, so there is nothing to manage. */
export const EmptyNoStripeCustomer: Story = {
  decorators: [
    function EmptyNoStripeCustomerDecorator(Story) {
      return (
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
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('button', { name: /Compare plans/ })
    ).toBeVisible();
  },
};

/** Error: the status query failed, so the row offers a retry. */
export const ErrorUnavailable: Story = {
  decorators: [
    function ErrorUnavailableDecorator(Story) {
      return (
        <BillingStoryShell billing={null} unavailable='error'>
          <Story />
        </BillingStoryShell>
      );
    },
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The classified retry backoff lands the terminal error a beat after
    // mount, so poll for the retry affordance instead of asserting once.
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: /Retry billing/ })
      ).toBeVisible()
    );
  },
};

/** Long content: a long cached-data warning wraps under the row. */
export const LongContentStaleReason: Story = {
  decorators: [
    function LongContentStaleReasonDecorator(Story) {
      return (
        <BillingStoryShell
          billing={{
            ...baseBilling,
            stale: true,
            staleReason:
              'Stripe is temporarily unavailable, so this shows the plan we last confirmed. Invoices, payment methods and plan changes will be available again as soon as the payment service recovers.',
          }}
        >
          <Story />
        </BillingStoryShell>
      );
    },
  ],
};

/** Right-to-left: the active plan row inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <BillingStoryShell billing={baseBilling}>
            <Story />
          </BillingStoryShell>
        </div>
      );
    },
  ],
};
