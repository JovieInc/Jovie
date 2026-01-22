/**
 * Stripe Webhooks Tests - Event Recording & Backwards Compatibility
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockConstructEvent,
  mockGetHandler,
  mockGetPlanFromPriceId,
  mockGetStripeObjectId,
  mockHandlerHandle,
  mockStripeTimestampToDate,
  mockWithTransaction,
  setSkipProcessing,
} from './webhooks.test-utils';

async function getPost() {
  const mod = await import('@/app/api/stripe/webhooks/route');
  return mod.POST;
}

describe('/api/stripe/webhooks - Event Recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSkipProcessing(false);
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

    await (await getPost())(request);

    // Verify getStripeObjectId was called to extract the object ID
    expect(mockGetStripeObjectId).toHaveBeenCalledWith(event);
    // Verify timestamp conversion was called
    expect(mockStripeTimestampToDate).toHaveBeenCalledWith(event.created);
  });
});

describe('/api/stripe/webhooks - Backwards Compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSkipProcessing(false);
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

    const response = await (await getPost())(request);
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

    const response = await (await getPost())(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Webhook processing failed');

    expect(mockConstructEvent).toHaveBeenCalled();
    expect(mockWithTransaction).toHaveBeenCalled();
  });
});
