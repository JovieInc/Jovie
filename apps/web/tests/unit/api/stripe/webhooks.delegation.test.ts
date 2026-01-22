/**
 * Stripe Webhooks Tests - Handler Delegation
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockConstructEvent,
  mockGetHandler,
  mockGetPlanFromPriceId,
  mockHandlerHandle,
  setSkipProcessing,
} from './webhooks.test-utils';

async function getPost() {
  const mod = await import('@/app/api/stripe/webhooks/route');
  return mod.POST;
}

describe('/api/stripe/webhooks - Handler Delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSkipProcessing(false);
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

    const response = await (await getPost())(request);
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

    const response = await (await getPost())(request);
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

    const response = await (await getPost())(request);
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

    const response = await (await getPost())(request);
    expect(response.status).toBe(200);

    expect(mockGetHandler).toHaveBeenCalledWith('invoice.payment_failed');
    expect(mockHandlerHandle).toHaveBeenCalled();
  });
});
