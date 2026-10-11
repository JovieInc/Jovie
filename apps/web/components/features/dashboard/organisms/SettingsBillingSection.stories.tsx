import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
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

/** Billing status query in flight: isLoading renders the "Syncing" badge. */
export const Loading: Story = {
  decorators: [
    Story => (
      <BillingStoryShell billing={null}>
        <Story />
      </BillingStoryShell>
    ),
  ],
};

/** Failed status must not advertise an unknown subscription as Free. */
export const Unavailable: Story = {
  decorators: [
    Story => (
      <BillingStoryShell billing={null} unavailable='error'>
        <Story />
      </BillingStoryShell>
    ),
  ],
};

/** A failed cached refresh must not claim current paid-state verification. */
export const UnavailableWithCachedPlan: Story = {
  decorators: [
    Story => (
      <BillingStoryShell billing={baseBilling} unavailable='error'>
        <Story />
      </BillingStoryShell>
    ),
  ],
};

export const Retrying: Story = {
  decorators: [
    Story => (
      <BillingStoryShell billing={null} unavailable='retrying'>
        <Story />
      </BillingStoryShell>
    ),
  ],
};

/** Runs in the existing Storybook browser/a11y lane with the real query hook. */
export const RetryRecovery: Story = {
  ...Unavailable,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const apiWindow = globalThis as typeof globalThis & {
      __jovieApiMock?: (request: {
        url: URL;
        init?: RequestInit;
      }) => Response | Promise<Response> | undefined;
    };
    const previousMock = apiWindow.__jovieApiMock;
    let finishRetry!: () => void;
    const pendingResponse = new Promise<void>(resolve => {
      finishRetry = resolve;
    });
    let requests = 0;
    apiWindow.__jovieApiMock = request => {
      if (request.url.pathname !== '/api/billing/status') {
        return previousMock?.(request);
      }
      requests += 1;
      return pendingResponse.then(() =>
        Response.json({
          isPro: true,
          plan: 'pro',
          stripeCustomerId: 'cus_story',
        })
      );
    };
    try {
      const retry = canvas.getByRole('button', { name: 'Retry billing' });
      const bounds = retry.getBoundingClientRect().toJSON();
      retry.focus();
      await userEvent.keyboard('{Enter}');
      await waitFor(() => expect(retry).toHaveAttribute('aria-busy', 'true'));
      await expect(retry).toHaveFocus();
      await expect(retry).toHaveAccessibleName('Retry billing');
      await expect(retry.getBoundingClientRect().toJSON()).toEqual(bounds);
      await userEvent.keyboard(' ');
      await expect(requests).toBe(1);
      finishRetry();
      await waitFor(() =>
        expect(retry).toHaveAccessibleName('Manage in Stripe')
      );
      await expect(retry).toHaveFocus();
      await expect(retry.getBoundingClientRect().toJSON()).toEqual(bounds);
      await expect(canvas.getByText('Pro plan')).toBeVisible();
      await expect(requests).toBe(1);
    } finally {
      finishRetry();
      apiWindow.__jovieApiMock = previousMock;
    }
  },
};
