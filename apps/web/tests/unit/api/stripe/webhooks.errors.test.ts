/**
 * Stripe Webhooks Tests - Error Propagation
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/stripe/webhooks/route';
import {
  mockCaptureCriticalError,
  mockConstructEvent,
  mockGetHandler,
  mockGetPlanFromPriceId,
  mockHandlerHandle,
  setSkipProcessing,
} from './webhooks.test-utils';

describe('/api/stripe/webhooks - Error Propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSkipProcessing(false);
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
