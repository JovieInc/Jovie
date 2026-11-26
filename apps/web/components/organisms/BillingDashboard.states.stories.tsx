import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { BillingDashboard } from './BillingDashboard';

type Answer = 'pending' | 'offline' | 'error' | 'free' | 'stale' | 'long';

const PRICING = {
  options: [
    {
      priceId: 'price_monthly',
      plan: 'pro',
      amount: 499,
      currency: 'usd',
      interval: 'month',
      description: 'Pro Monthly',
    },
  ],
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Answers the billing routes from fixtures so no request leaves the browser. */
function stubBillingApi(answer: Answer) {
  globalThis.fetch = async input => {
    const url = String(input);
    if (answer === 'pending') return new Promise<Response>(() => {});
    if (answer === 'offline') throw new TypeError('Failed to fetch');
    if (answer === 'error') return json({ error: 'unavailable' }, 500);
    if (url.includes('/api/billing/status')) {
      return json({
        isPro: false,
        plan: 'free',
        hasStripeCustomer: false,
        stripeSubscriptionId: null,
        _stale: answer === 'stale' || answer === 'long',
        _staleReason:
          answer === 'long'
            ? 'Payment service temporarily unavailable while the provider finishes a long maintenance window. Showing your latest saved status until the connection is restored, which can take a while.'
            : answer === 'stale'
              ? 'Payment service temporarily unavailable. Showing your latest saved status.'
              : undefined,
      });
    }
    if (url.includes('/api/stripe/pricing-options')) return json(PRICING);
    if (url.includes('/api/billing/history')) return json({ entries: [] });
    return json({ priceLock: null });
  };
}

function BillingApiFrame({
  answer,
  children,
}: {
  readonly answer: Answer;
  readonly children: ReactNode;
}) {
  const [client] = useState(() => {
    stubBillingApi(answer);
    return new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function withBillingApi(answer: Answer) {
  return function BillingApiDecorator(Story: () => ReactNode) {
    return (
      <BillingApiFrame answer={answer}>
        <Story />
      </BillingApiFrame>
    );
  };
}

const meta = {
  title: 'Organisms/BillingDashboard/States',
  component: BillingDashboard,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof BillingDashboard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: both billing queries are still in flight. */
export const Loading: Story = {
  decorators: [withBillingApi('pending')],
};

/** Error: the billing service answers 500 and the retry banner shows. */
export const Error: Story = {
  decorators: [withBillingApi('error')],
};

/** Offline: the network fails before any response arrives. */
export const Offline: Story = {
  decorators: [withBillingApi('offline')],
};

/** Empty: a free account with no billing history. */
export const Empty: Story = {
  decorators: [withBillingApi('free')],
};

/** Partial: Stripe is down so the saved status shows with a stale notice. */
export const Partial: Story = {
  decorators: [withBillingApi('stale')],
};

/** LongContent: a very long stale reason wraps inside the notice. */
export const LongContent: Story = {
  decorators: [withBillingApi('long')],
};

/** Rtl: the dashboard mirrors for a right-to-left locale. */
export const Rtl: Story = {
  decorators: [
    function RtlFrame(Story: () => ReactNode) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
    withBillingApi('free'),
  ],
};
