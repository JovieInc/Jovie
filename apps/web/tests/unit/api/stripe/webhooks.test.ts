/**
 * Stripe Webhooks Route Integration Tests
 *
 * Tests for the main webhook route at /api/stripe/webhooks.
 * These tests verify the route's signature verification, idempotency,
 * and handler delegation to the modular webhook handler architecture.
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/stripe/webhooks/route';

// Hoisted mocks - these need to be defined before vi.mock calls
// Track if event should be skipped (already processed)
let skipProcessing = false;

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
    // Create a mock transaction context
    const txContext = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve(
                skipProcessing
                  ? [{ id: 'existing-id', processedAt: new Date() }]
                  : []
              )
            ),
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

  // Mock handler handle method
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

const { headers } = await import('next/headers');

describe('/api/stripe/webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    skipProcessing = false;
    mockGetPlanFromPriceId.mockReturnValue('standard');
    // Default: return null handler (unhandled event type)
    mockGetHandler.mockReturnValue(null);
  });

  describe('signature verification', () => {
    it('returns 400 when signature header is missing', async () => {
      vi.mocked(headers).mockResolvedValue(new Map() as any);

      const request = new NextRequest(
        'http://localhost:3000/api/stripe/webhooks',
        {
          method: 'POST',
          body: 'test-body',
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Missing signature');
    });

    it('returns 400 when signature is invalid', async () => {
      vi.mocked(headers).mockResolvedValue(
        new Map([['stripe-signature', 'sig_invalid']]) as any
      );

      mockConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const request = new NextRequest(
        'http://localhost:3000/api/stripe/webhooks',
        {
          method: 'POST',
          body: 'test-body',
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid signature');
    });
  });

  describe('idempotency handling', () => {
    it('skips processing for duplicate events', async () => {
      vi.mocked(headers).mockResolvedValue(
        new Map([['stripe-signature', 'sig_test']]) as any
      );

      const event = {
        id: 'evt_duplicate',
        type: 'checkout.session.completed',
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: 'cs_test' } },
      } as any;

      mockConstructEvent.mockReturnValue(event);

      // Set up to return an already-processed event
      skipProcessing = true;

      const request = new NextRequest(
        'http://localhost:3000/api/stripe/webhooks',
        {
          method: 'POST',
          body: 'test-body',
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.received).toBe(true);

      expect(mockConstructEvent).toHaveBeenCalled();
      expect(mockWithTransaction).toHaveBeenCalled();
      // Should not call handler for duplicate events
      expect(mockHandlerHandle).not.toHaveBeenCalled();
    });
  });

  describe('handler delegation', () => {
    it('delegates to the correct handler for supported event types', async () => {
      vi.mocked(headers).mockResolvedValue(
        new Map([['stripe-signature', 'sig_test']]) as any
      );

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
      vi.mocked(headers).mockResolvedValue(
        new Map([['stripe-signature', 'sig_test']]) as any
      );

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
      vi.mocked(headers).mockResolvedValue(
        new Map([['stripe-signature', 'sig_test']]) as any
      );

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
      vi.mocked(headers).mockResolvedValue(
        new Map([['stripe-signature', 'sig_test']]) as any
      );

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
          body: 'test-body',
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(200);

      expect(mockGetHandler).toHaveBeenCalledWith('invoice.payment_failed');
      expect(mockHandlerHandle).toHaveBeenCalled();
    });
  });

  describe('error propagation from handlers', () => {
    it('returns 500 when handler throws an error', async () => {
      vi.mocked(headers).mockResolvedValue(
        new Map([['stripe-signature', 'sig_test']]) as any
      );

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
      mockHandlerHandle.mockRejectedValue(
        new Error('Handler processing failed')
      );

      const request = new NextRequest(
        'http://localhost:3000/api/stripe/webhooks',
        {
          method: 'POST',
          body: 'test-body',
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Webhook processing failed');
    });

    it('returns 500 when handler returns an error result', async () => {
      vi.mocked(headers).mockResolvedValue(
        new Map([['stripe-signature', 'sig_test']]) as any
      );

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
      vi.mocked(headers).mockResolvedValue(
        new Map([['stripe-signature', 'sig_test']]) as any
      );

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
          body: 'test-body',
        }
      );

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.received).toBe(true);
    });
  });

  describe('webhook event recording', () => {
    it('records webhook event with extracted object ID', async () => {
      vi.mocked(headers).mockResolvedValue(
        new Map([['stripe-signature', 'sig_test']]) as any
      );

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

  describe('backwards compatibility', () => {
    it('processes a new checkout.session.completed event and records webhook', async () => {
      vi.mocked(headers).mockResolvedValue(
        new Map([['stripe-signature', 'sig_test']]) as any
      );

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
      vi.mocked(headers).mockResolvedValue(
        new Map([['stripe-signature', 'sig_test']]) as any
      );

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
});
