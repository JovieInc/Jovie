/**
 * Stripe Webhooks Tests - Event Recording & Backwards Compatibility
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockConstructEvent,
  mockRetrieve,
  mockUpdateBilling,
  mockGetPlanFromPriceId,
  mockWithTransaction,
  mockGetHandler,
  mockGetStripeObjectId,
  mockStripeTimestampToDate,
  mockHandlerHandle,
  mockCaptureCriticalError,
} = vi.hoisted(() => {
  const mockTx = vi.fn(async (callback: any) => {
    const txContext = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'webhook-1' }])),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
    };
    try {
      const result = await callback(txContext);
      return { data: result, error: null };
    } catch (error) {
      return { data: null, error };
    }
  });

  return {
    mockConstructEvent: vi.fn(),
    mockRetrieve: vi.fn(),
    mockUpdateBilling: vi.fn(),
    mockGetPlanFromPriceId: vi.fn(() => 'standard'),
    mockWithTransaction: mockTx,
    mockGetHandler: vi.fn(),
    mockGetStripeObjectId: vi.fn(() => 'obj_123'),
    mockStripeTimestampToDate: vi.fn(
      (timestamp: number) => new Date(timestamp * 1000)
    ),
    mockHandlerHandle: vi.fn(),
    mockCaptureCriticalError: vi.fn(),
  };
});

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieve },
  },
}));

vi.mock('@/lib/db', () => ({
  db: {},
  users: {
    clerkId: 'clerk_id_column',
    stripeCustomerId: 'stripe_customer_id_column',
  },
  stripeWebhookEvents: {
    id: 'id',
    stripeEventId: 'stripe_event_id',
    processedAt: 'processed_at',
  },
  withTransaction: mockWithTransaction,
}));

vi.mock('@/lib/db/schema', () => ({
  users: {
    clerkId: 'clerk_id_column',
    stripeCustomerId: 'stripe_customer_id_column',
  },
  stripeWebhookEvents: {
    id: 'id',
    stripeEventId: 'stripe_event_id',
    processedAt: 'processed_at',
  },
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateBilling,
}));
vi.mock('@/lib/stripe/config', () => ({
  getPlanFromPriceId: mockGetPlanFromPriceId,
}));
vi.mock('@/lib/env-server', () => ({
  env: { STRIPE_WEBHOOK_SECRET: 'whsec_test' },
}));
vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
  captureWarning: vi.fn(),
  logFallback: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('@/lib/stripe/webhooks', () => ({
  getHandler: mockGetHandler,
  getStripeObjectId: mockGetStripeObjectId,
  stripeTimestampToDate: mockStripeTimestampToDate,
}));

import { POST } from '@/app/api/stripe/webhooks/route';

describe('/api/stripe/webhooks - Event Recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockGetHandler.mockReturnValue(null);
  });

  it('records webhook event with extracted object ID', async () => {
    const event = {
      id: 'evt_record_test',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'cs_record',
          customer: 'cus_123',
          subscription: 'sub_123',
        },
      },
    } as any;

    mockConstructEvent.mockReturnValue(event);
    mockGetStripeObjectId.mockReturnValue('cs_record');
    mockGetHandler.mockReturnValue({
      eventTypes: ['checkout.session.completed'] as const,
      handle: vi.fn().mockResolvedValue({ success: true }),
    });

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_test' },
        body: 'test-body',
      }
    );

    await POST(request);

    // Verify getStripeObjectId was called to extract the object ID
    expect(mockGetStripeObjectId).toHaveBeenCalledWith(event);
    // Verify timestamp conversion was called
    expect(mockStripeTimestampToDate).toHaveBeenCalledWith(event.created);
  });
});

describe('/api/stripe/webhooks - Backwards Compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockGetHandler.mockReturnValue(null);
  });

  it('processes a new checkout.session.completed event and records webhook', async () => {
    const event = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'cs_test',
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: { clerk_user_id: 'user_123' },
        },
      },
    } as any;

    mockConstructEvent.mockReturnValue(event);

    // Set up handler to succeed
    const mockHandler = {
      eventTypes: ['checkout.session.completed'] as const,
      handle: mockHandlerHandle,
    };
    mockGetHandler.mockReturnValue(mockHandler);
    mockHandlerHandle.mockResolvedValue({ success: true, isActive: true });

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_test' },
        body: 'test-body',
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.received).toBe(true);

    expect(mockConstructEvent).toHaveBeenCalled();
    expect(mockWithTransaction).toHaveBeenCalled();
  });

  it('returns 500 when handler indicates processing failed (legacy behavior)', async () => {
    const event = {
      id: 'evt_unknown',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'cs_unknown',
          customer: 'cus_123',
          subscription: 'sub_unknown',
          metadata: { clerk_user_id: 'user_123' },
        },
      },
    } as any;

    mockConstructEvent.mockReturnValue(event);

    // Handler returns error for unknown price
    const mockHandler = {
      eventTypes: ['checkout.session.completed'] as const,
      handle: mockHandlerHandle,
    };
    mockGetHandler.mockReturnValue(mockHandler);
    mockHandlerHandle.mockResolvedValue({
      success: false,
      skipped: false,
      error: 'Unknown price ID: price_unknown',
    });

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_test' },
        body: 'test-body',
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Webhook processing failed');

    expect(mockConstructEvent).toHaveBeenCalled();
    expect(mockWithTransaction).toHaveBeenCalled();
  });
});
