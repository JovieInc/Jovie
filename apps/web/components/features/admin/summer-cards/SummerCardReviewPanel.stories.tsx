'use client';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect } from 'react';
import type { SummerCard } from '@/lib/ovie/summer-cards';
import { SummerCardReviewPanel } from './SummerCardReviewPanel';

const pendingCards: readonly SummerCard[] = [
  {
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
  },
  {
    id: 'sc_fedcba9876543210fedcba9876543210',
    idempotencyKey: 'spend-0002',
    kind: 'spend',
    product: 'jov',
    title: 'Boost release announcement',
    body: 'Paid boost for the release announcement on Instagram.',
    recommendation: 'Approve $400',
    defaultIfSilent: 'Do nothing',
    recipient: null,
    amountUsd: 400,
    evidence: [],
    status: 'pending',
    comment: null,
    createdAt: '2026-09-07T14:30:00.000Z',
    decidedAt: null,
  },
];

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
}

function MockSummerCardsFetch({
  children,
  mode,
}: Readonly<{
  readonly children: ReactNode;
  readonly mode: 'pending' | 'empty' | 'forbidden' | 'loading';
}>) {
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
        if (mode === 'loading') {
          return new Promise<Response>(() => {});
        }
        if (mode === 'forbidden') {
          return jsonResponse(
            {
              error:
                'Use an admin Ovie account or re-open Ovie after re-authentication, then retry.',
            },
            { status: 403 }
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

      if (typeof originalFetch === 'function') {
        return originalFetch(input, init);
      }

      return jsonResponse(
        { error: 'Unhandled story request' },
        { status: 404 }
      );
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
    jovie: {
      uncoveredProps: ['isLoading'],
    },
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

export const Pending: Story = {
  render: () => (
    <MockSummerCardsFetch mode='pending'>
      <SummerCardReviewPanel />
    </MockSummerCardsFetch>
  ),
};

export const Empty: Story = {
  render: () => (
    <MockSummerCardsFetch mode='empty'>
      <SummerCardReviewPanel />
    </MockSummerCardsFetch>
  ),
};

export const Forbidden: Story = {
  render: () => (
    <MockSummerCardsFetch mode='forbidden'>
      <SummerCardReviewPanel />
    </MockSummerCardsFetch>
  ),
};

export const Loading: Story = {
  render: () => (
    <MockSummerCardsFetch mode='loading'>
      <SummerCardReviewPanel />
    </MockSummerCardsFetch>
  ),
};
