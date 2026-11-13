import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useLayoutEffect } from 'react';
import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';

export function UpgradeQueryProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
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

/**
 * How the story's local checkout endpoint answers. Stories never reach
 * /api/stripe/checkout: fetch is replaced for the life of the story and
 * restored on unmount, and any other request throws.
 */
type CheckoutReply = 'pending' | 'server-error' | 'offline';

export function LocalCheckoutApi({
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

export const STORY_PRICE_ID = 'price_story_artist_presence';
