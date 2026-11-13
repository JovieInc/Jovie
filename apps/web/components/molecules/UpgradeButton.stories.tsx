import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useLayoutEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { UpgradeButton } from './UpgradeButton';

function UpgradeQueryProvider({ children }: { readonly children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Molecules/UpgradeButton',
  component: UpgradeButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <UpgradeQueryProvider>
        <Story />
      </UpgradeQueryProvider>
    ),
  ],
  args: {
    variant: 'primary',
    size: 'md',
  },
} satisfies Meta<typeof UpgradeButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * How the story's local checkout endpoint answers. Stories never reach
 * /api/stripe/checkout: fetch is replaced for the life of the story and
 * restored on unmount, and any other request throws.
 */
type CheckoutReply = 'pending' | 'server-error' | 'offline';

function LocalCheckoutApi({
  reply,
  children,
}: {
  readonly reply: CheckoutReply;
  readonly children: ReactNode;
}) {
  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async input => {
      if (String(input).includes('/api/stripe/pricing-options')) {
        return Response.json({
          options: [
            {
              priceId: STORY_PRICE_ID,
              amount: toCents(ARTIST_VISIBILITY_OFFER.pro.monthlyUsd),
              currency: ARTIST_VISIBILITY_OFFER.pro.currency,
              interval: 'month',
              description: ARTIST_VISIBILITY_OFFER.pro.displayName,
            },
          ],
        });
      }
      if (!String(input).includes('/api/stripe/checkout')) {
        throw new Error('Unexpected network request in UpgradeButton story.');
      }
      if (reply === 'pending') return new Promise<Response>(() => undefined);
      if (reply === 'offline') throw new TypeError('Failed to fetch');
      return new Response(
        JSON.stringify({ error: 'Stories never check out.' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [reply]);

  // Direct checkout is the only path that calls the endpoint, so the flag is
  // pinned on regardless of the repo default.
  return (
    <AppFlagProvider
      initialFlags={{ ...APP_FLAG_DEFAULTS, BILLING_UPGRADE_DIRECT: true }}
    >
      {children}
    </AppFlagProvider>
  );
}

const STORY_PRICE_ID = 'price_story_artist_presence';

export const Default: Story = {
  decorators: [
    Story => (
      <LocalCheckoutApi reply='server-error'>
        <Story />
      </LocalCheckoutApi>
    ),
  ],
};

export const DefaultPriceCheckout: Story = {
  decorators: [
    Story => (
      <LocalCheckoutApi reply='pending'>
        <Story />
      </LocalCheckoutApi>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = await canvas.findByRole('button', {
      name: 'Upgrade to Artist Presence',
    });
    await userEvent.click(button);
    await expect(
      await canvas.findByRole('button', { name: 'Loading...' })
    ).toBeDisabled();
  },
};

export const Secondary: Story = {
  args: {
    variant: 'secondary',
  },
};

export const CustomLabel: Story = {
  args: {
    children: 'Go Pro',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const LoadingCheckout: Story = {
  args: { priceId: STORY_PRICE_ID },
  decorators: [
    Story => (
      <LocalCheckoutApi reply='pending'>
        <Story />
      </LocalCheckoutApi>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await expect(
      await canvas.findByRole('button', { name: 'Loading...' })
    ).toBeDisabled();
  },
};

export const ErrorCheckout: Story = {
  args: { priceId: STORY_PRICE_ID },
  decorators: [
    Story => (
      <LocalCheckoutApi reply='server-error'>
        <Story />
      </LocalCheckoutApi>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await expect(
      await canvas.findByText(
        'Request failed due to a temporary server issue. Please try again.'
      )
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button')).toBeEnabled();
  },
};

export const OfflineCheckout: Story = {
  args: { priceId: STORY_PRICE_ID },
  decorators: [
    Story => (
      <LocalCheckoutApi reply='offline'>
        <Story />
      </LocalCheckoutApi>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button'));
    await expect(
      await canvas.findByText('Network request failed')
    ).toBeInTheDocument();
    await expect(canvas.getByRole('button')).toBeEnabled();
  },
};

export const LongContentLabel: Story = {
  args: {
    children:
      'Upgrade to Artist Presence and unlock every fan notification channel',
  },
  render: args => (
    <div className='w-64'>
      <UpgradeButton {...args} />
    </div>
  ),
};

export const RtlLabel: Story = {
  args: {
    children: 'الترقية إلى الحضور الفني',
  },
  render: args => (
    <div dir='rtl' className='w-64'>
      <UpgradeButton {...args} />
    </div>
  ),
};
