/**
 * Stripe Webhooks Tests - Error Propagation
 */

import { PgDialect } from 'drizzle-orm/pg-core';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPost,
  mockCaptureCriticalError,
  mockConstructEvent,
  mockDbUpdateSet,
  mockDbUpdateWhere,
  mockGetHandler,
  mockGetPlanFromPriceId,
  mockHandlerHandle,
  mockUpdateBilling,
  setSimulateLeaseLossBeforeFinalize,
  setSkipProcessing,
} from './webhooks.test-utils';

describe('/api/stripe/webhooks - Error Propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSkipProcessing(false);
    setSimulateLeaseLossBeforeFinalize(false);
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

    const response = await (await getPost())(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Webhook processing failed');
    expect(mockDbUpdateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ processedAt: expect.any(Date) })
    );
    expect(mockDbUpdateSet).toHaveBeenCalledWith({
      processingStartedAt: null,
    });
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

    const response = await (await getPost())(request);
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

  it('keeps the event retryable when atomic billing persistence fails in a real handler', async () => {
    const { SubscriptionHandler } = await import(
      '@/lib/stripe/webhooks/handlers/subscription-handler'
    );
    const event = {
      id: 'evt_atomic_billing_failure',
      type: 'customer.subscription.created',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'sub_atomic_billing_failure',
          status: 'active',
          customer: 'cus_atomic_billing_failure',
          metadata: { clerk_user_id: 'user_atomic_billing_failure' },
          items: { data: [{ price: { id: 'price_pro_monthly' } }] },
        },
      },
    } as any;

    mockConstructEvent.mockReturnValue(event);
    mockGetHandler.mockReturnValue(new SubscriptionHandler());
    mockUpdateBilling.mockResolvedValue({
      success: false,
      error: 'Atomic entitlement and audit persistence failed',
    });

    const response = await (await getPost())(
      new NextRequest('http://localhost:3000/api/stripe/webhooks', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_test' },
        body: 'test-body',
      })
    );

    expect(response.status).toBe(500);
    expect(mockUpdateBilling).toHaveBeenCalledOnce();
    expect(mockDbUpdateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({ processedAt: expect.any(Date) })
    );
    expect(mockDbUpdateSet).toHaveBeenCalledWith({
      processingStartedAt: null,
    });
  });

  it('does not finalize or release a lease after ownership moves to another worker', async () => {
    const event = {
      id: 'evt_lease_moved',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cs_lease_moved' } },
    } as any;

    mockConstructEvent.mockReturnValue(event);
    mockGetHandler.mockReturnValue({
      eventTypes: ['checkout.session.completed'] as const,
      handle: mockHandlerHandle,
    });
    mockHandlerHandle.mockResolvedValue({ success: true });
    setSimulateLeaseLossBeforeFinalize(true);

    const response = await (await getPost())(
      new NextRequest('http://localhost:3000/api/stripe/webhooks', {
        method: 'POST',
        headers: { 'stripe-signature': 'sig_test' },
        body: 'test-body',
      })
    );

    expect(response.status).toBe(500);
    expect(mockHandlerHandle).toHaveBeenCalledOnce();

    const leaseStartedAt = (
      mockDbUpdateSet.mock.calls[0]?.[0] as {
        processingStartedAt?: Date;
      }
    ).processingStartedAt;
    expect(leaseStartedAt).toBeInstanceOf(Date);

    const dialect = new PgDialect();
    const finalizeQuery = dialect.sqlToQuery(
      mockDbUpdateWhere.mock.calls[1]?.[0]
    );
    const releaseQuery = dialect.sqlToQuery(
      mockDbUpdateWhere.mock.calls[2]?.[0]
    );
    const ownedLeaseParams = ['webhook-1', leaseStartedAt?.toISOString()];
    expect(finalizeQuery.params).toEqual(ownedLeaseParams);
    expect(releaseQuery.params).toEqual(ownedLeaseParams);
    for (const query of [finalizeQuery, releaseQuery]) {
      expect(query.sql).toContain('"id" = $1');
      expect(query.sql).toContain('"processing_started_at" = $2');
      expect(query.sql).toContain('"processed_at" is null');
    }
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Stripe webhook processing failed',
      expect.objectContaining({
        message: expect.stringContaining('lease ownership was lost'),
      }),
      expect.objectContaining({ eventId: 'evt_lease_moved' })
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

    const response = await (await getPost())(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.received).toBe(true);
  });
});
