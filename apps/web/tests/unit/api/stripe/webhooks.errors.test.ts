/**
 * Stripe Webhooks Tests - Error Propagation
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

describe('/api/stripe/webhooks - Error Propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockGetHandler.mockReturnValue(null);
  });

  it('returns 500 when handler throws an error', async () => {
    const event = {
      id: 'evt_error',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'cs_error',
          customer: 'cus_123',
          subscription: 'sub_123',
        },
      },
    } as any;

    mockConstructEvent.mockReturnValue(event);

    // Create a handler that throws
    const mockHandler = {
      eventTypes: ['checkout.session.completed'] as const,
      handle: mockHandlerHandle,
    };
    mockGetHandler.mockReturnValue(mockHandler);
    mockHandlerHandle.mockRejectedValue(new Error('Handler processing failed'));

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
  });

  it('returns 500 when handler returns an error result', async () => {
    const event = {
      id: 'evt_error_result',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'cs_error_result',
          customer: 'cus_123',
          subscription: 'sub_123',
        },
      },
    } as any;

    mockConstructEvent.mockReturnValue(event);

    // Create a handler that returns an error result
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

    // Verify error was captured
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      expect.stringContaining('Handler failed'),
      expect.any(Error),
      expect.objectContaining({
        eventType: 'checkout.session.completed',
      })
    );
  });

  it('does not treat skipped results as errors', async () => {
    const event = {
      id: 'evt_skipped',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'cs_skipped',
          customer: 'cus_123',
          subscription: null, // One-time payment
        },
      },
    } as any;

    mockConstructEvent.mockReturnValue(event);

    // Create a handler that returns a skipped result
    const mockHandler = {
      eventTypes: ['checkout.session.completed'] as const,
      handle: mockHandlerHandle,
    };
    mockGetHandler.mockReturnValue(mockHandler);
    mockHandlerHandle.mockResolvedValue({
      success: true,
      skipped: true,
      reason: 'checkout_session_has_no_subscription',
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
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.received).toBe(true);
  });
});
