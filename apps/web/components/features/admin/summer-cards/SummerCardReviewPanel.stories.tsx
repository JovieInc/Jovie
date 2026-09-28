'use client';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect } from 'react';
import type { SummerCard } from '@/lib/ovie/summer-cards';
import { SummerCardReviewPanel } from './SummerCardReviewPanel';

function card(overrides: Partial<SummerCard>): SummerCard {
  return {
    id: 'sc_0123456789abcdef0123456789abcdef',
    idempotencyKey: 'outbound-0001',
    kind: 'outbound',
    product: 'jov',
    title: 'Email 12 claimed artists',
    body: 'Draft body for the outbound send.',
    recommendation: 'Send it',
    defaultIfSilent: null,
    recipient: 'claimed artists',
    amountUsd: null,
    evidence: ['https://example.com/list'],
    status: 'pending',
    comment: null,
    createdAt: '2026-09-06T10:00:00.000Z',
    decidedAt: null,
    ...overrides,
  };
}

const pendingCards: readonly SummerCard[] = [
  card({}),
  card({
    id: 'sc_fedcba9876543210fedcba9876543210',
    idempotencyKey: 'spend-0002',
    kind: 'spend',
    title: 'Boost release announcement',
    body: 'Paid boost for the release announcement on Instagram.',
    recommendation: 'Approve $400',
    defaultIfSilent: 'Do nothing',
    recipient: null,
    amountUsd: 400,
    evidence: [],
    createdAt: '2026-09-07T14:30:00.000Z',
  }),
];

type Mode = 'pending' | 'empty' | 'forbidden' | 'loading';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function MockSummerCardsFetch({
  children,
  mode,
}: Readonly<{ readonly children: ReactNode; readonly mode: Mode }>) {
  useEffect(() => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const rawUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const path = rawUrl.startsWith('http')
        ? new URL(rawUrl).pathname
        : rawUrl;

      if (path === '/api/ovie/summer-cards') {
        if (mode === 'loading') return new Promise<Response>(() => {});
        if (mode === 'forbidden') {
          return jsonResponse(
            {
              error:
                'Use an admin Ovie account or re-open Ovie after re-authentication, then retry.',
            },
            403
          );
        }
        const cards = mode === 'pending' ? pendingCards : [];
        return jsonResponse({ cards, pendingCount: cards.length });
      }

      if (
        path.startsWith('/api/ovie/summer-cards/') &&
        path.endsWith('/decision')
      ) {
        return jsonResponse({ ok: true });
      }

      if (typeof originalFetch === 'function')
        return originalFetch(input, init);
      return jsonResponse({ error: 'Unhandled story request' }, 404);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  }, [mode]);

  return children;
}

const meta = {
  title: 'Features/Admin/Summer Cards/SummerCardReviewPanel',
  component: SummerCardReviewPanel,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['isLoading'] },
  },
  decorators: [
    Story => (
      <div className='w-[min(42rem,calc(100vw-2rem))]'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SummerCardReviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const withMode = (mode: Mode): Story => ({
  render: () => (
    <MockSummerCardsFetch mode={mode}>
      <SummerCardReviewPanel />
    </MockSummerCardsFetch>
  ),
});

export const Pending = withMode('pending');
export const Empty = withMode('empty');
export const Forbidden = withMode('forbidden');
export const Loading = withMode('loading');
