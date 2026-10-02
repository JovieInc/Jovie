import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockConstructEvent = vi.hoisted(() => vi.fn());
const mockInsert = vi.hoisted(() => vi.fn());
const mockSelect = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockHandleCheckout = vi.hoisted(() => vi.fn());

vi.mock('@/lib/env-server', () => ({
  env: { STRIPE_WEBHOOK_SECRET_MERCH: 'whsec_test' },
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: {
      constructEvent: mockConstructEvent,
    },
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
    update: mockUpdate,
  },
}));

vi.mock('@/lib/merch/orders', () => ({
  handleMerchCheckoutCompleted: mockHandleCheckout,
  handleMerchChargeRefunded: vi.fn(),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

function merchRequest(): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/stripe-merch', {
    method: 'POST',
    body: '{}',
    headers: { 'stripe-signature': 'sig_test' },
  });
}

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
  });

  it('returns 503 when another worker already holds the lease', async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: 'row_1', processedAt: null }]),
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

    const { POST } = await import('@/app/api/webhooks/stripe-merch/route');
    const response = await POST(merchRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
    expect(await response.json()).toEqual({
      error: 'Webhook processing in progress',
    });
    expect(mockHandleCheckout).not.toHaveBeenCalled();
  });

  it('acknowledges an event that is already processed', async () => {
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([{ id: 'row_1', processedAt: new Date() }]),
        }),
      }),
    });

    const { POST } = await import('@/app/api/webhooks/stripe-merch/route');
    const response = await POST(merchRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockHandleCheckout).not.toHaveBeenCalled();
  });
});
