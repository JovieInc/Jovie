/**
 * Stripe Webhooks Tests - Handler Delegation
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
  const mockGetPlan = vi.fn<(priceId: string) => string | null>(
    () => 'standard'
  );

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

  const mockHandle = vi.fn();

  return {
    mockConstructEvent: vi.fn(),
    mockRetrieve: vi.fn(),
    mockUpdateBilling: vi.fn(),
    mockGetPlanFromPriceId: mockGetPlan,
    mockWithTransaction: mockTx,
    mockGetHandler: vi.fn(),
    mockGetStripeObjectId: vi.fn(() => 'obj_123'),
    mockStripeTimestampToDate: vi.fn(
      (timestamp: number) => new Date(timestamp * 1000)
    ),
    mockHandlerHandle: mockHandle,
    mockCaptureCriticalError: vi.fn(),
  };
});

// Set up all mocks
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: {
      constructEvent: mockConstructEvent,
    },
    subscriptions: {
      retrieve: mockRetrieve,
    },
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
  env: {
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: mockCaptureCriticalError,
  captureWarning: vi.fn(),
  logFallback: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

// Mock the modular webhook handler architecture
vi.mock('@/lib/stripe/webhooks', () => ({
  getHandler: mockGetHandler,
  getStripeObjectId: mockGetStripeObjectId,
  stripeTimestampToDate: mockStripeTimestampToDate,
}));

import { POST } from '@/app/api/stripe/webhooks/route';

describe('/api/stripe/webhooks - Handler Delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockGetHandler.mockReturnValue(null);
  });

  it('delegates to the correct handler for supported event types', async () => {
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

    // Create a mock handler
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

    // Verify handler was looked up and invoked
    expect(mockGetHandler).toHaveBeenCalledWith('checkout.session.completed');
    expect(mockHandlerHandle).toHaveBeenCalledWith(
      expect.objectContaining({
        event,
        stripeEventId: 'evt_1',
        stripeEventTimestamp: expect.any(Date),
      })
    );
  });

  it('returns success for unhandled event types without processing', async () => {
    const event = {
      id: 'evt_unhandled',
      type: 'customer.created', // An unhandled event type
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cus_new' } },
    } as any;

    mockConstructEvent.mockReturnValue(event);
    // Return null for unhandled event type
    mockGetHandler.mockReturnValue(null);

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

    // Verify handler lookup was attempted
    expect(mockGetHandler).toHaveBeenCalledWith('customer.created');
    // Handler should not be called since none was found
    expect(mockHandlerHandle).not.toHaveBeenCalled();
  });

  it('handles subscription.updated events via handler delegation', async () => {
    const event = {
      id: 'evt_sub_updated',
      type: 'customer.subscription.updated',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'sub_123',
          status: 'active',
          customer: 'cus_123',
          items: { data: [{ price: { id: 'price_123' } }] },
          metadata: { clerk_user_id: 'user_123' },
        },
      },
    } as any;

    mockConstructEvent.mockReturnValue(event);

    // Create mock subscription handler
    const mockHandler = {
      eventTypes: ['customer.subscription.updated'] as const,
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

    expect(mockGetHandler).toHaveBeenCalledWith(
      'customer.subscription.updated'
    );
    expect(mockHandlerHandle).toHaveBeenCalled();
  });

  it('handles invoice.payment_failed events via handler delegation', async () => {
    const event = {
      id: 'evt_payment_failed',
      type: 'invoice.payment_failed',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'in_123',
          subscription: 'sub_123',
          customer: 'cus_123',
        },
      },
    } as any;

    mockConstructEvent.mockReturnValue(event);

    // Create mock payment handler
    const mockHandler = {
      eventTypes: ['invoice.payment_failed'] as const,
      handle: mockHandlerHandle,
    };
    mockGetHandler.mockReturnValue(mockHandler);
    mockHandlerHandle.mockResolvedValue({ success: true, isActive: false });

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

    expect(mockGetHandler).toHaveBeenCalledWith('invoice.payment_failed');
    expect(mockHandlerHandle).toHaveBeenCalled();
  });
});
