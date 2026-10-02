import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConstructEvent = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: { STRIPE_WEBHOOK_SECRET_MERCH: 'whsec_test' },
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: { webhooks: { constructEvent: mockConstructEvent } },
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock('@/lib/db/schema/billing', () => ({
  stripeWebhookEvents: {
    id: 'id',
    stripeEventId: 'stripeEventId',
    processedAt: 'processedAt',
    processingStartedAt: 'processingStartedAt',
  },
}));

vi.mock('@/lib/merch/orders', () => ({
  handleMerchCheckoutCompleted: vi.fn(),
  handleMerchChargeRefunded: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
}));

describe('POST /api/webhooks/stripe-merch claim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConstructEvent.mockReturnValue({
      id: 'evt_merch',
      type: 'checkout.session.completed',
      created: 1_700_000_000,
      data: { object: { id: 'cs_merch' } },
    });
    mockInsert.mockReturnValue({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    });
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: 'row-1', processedAt: null }]),
        }),
      }),
    });
    mockUpdate.mockReturnValue({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    });
  });

  it('returns 503 when another worker holds the processing lease', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe-merch/route');
    const response = await POST(
      new NextRequest('https://jov.ie/api/webhooks/stripe-merch', {
        method: 'POST',
        body: '{}',
        headers: { 'stripe-signature': 'sig_test' },
      })
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Webhook processing in progress',
    });
    expect(response.headers.get('Retry-After')).toBe('5');
  });
});
