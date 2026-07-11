/**
 * Stripe Webhooks Tests - Idempotency / CAS / Retry / Outer Error / Config Guard
 *
 * Covers:
 * - Idempotency via durable unique constraint (onConflictDoNothing CAS)
 * - Conflict detection + 409-style dedupe (processed dups return 200, unprocessed retry)
 * - Data race (disappear) → 500
 * - Retry path for prior handler failure
 * - Outer catch boundary (timestamp, post-sig errors)
 * - Signature (sibling file)
 * - Config guard for missing STRIPE_WEBHOOK_SECRET (early return + critical capture)
 * - Method guard (GET 405)
 *
 * Per AGENTS + security.md + TEST_RISK_REGISTER: money surface (Stripe webhooks) requires
 * contract tests for idempotency/CAS/retry/signature/outer-catch. Stryker mandatory.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockCaptureCriticalError,
  mockConstructEvent,
  mockDbInsert,
  mockDbSelect,
  mockDbUpdate,
  mockGetHandler,
  mockGetPlanFromPriceId,
  mockHandlerHandle,
  mockStripeTimestampToDate,
  setSimulateActiveLease,
  setSimulateLeaseClaimFailure,
  setSimulateRaceDisappear,
  setSimulateUnprocessedRetry,
  setSkipProcessing,
} from './webhooks.test-utils';

const { POST } = await import('@/app/api/stripe/webhooks/route');

describe('/api/stripe/webhooks - Idempotency Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSkipProcessing(false);
    setSimulateRaceDisappear(false);
    setSimulateUnprocessedRetry(false);
    setSimulateActiveLease(false);
    setSimulateLeaseClaimFailure(false);
    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockGetHandler.mockReturnValue(null);
  });

  it('skips processing for duplicate events', async () => {
    const event = {
      id: 'evt_duplicate',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cs_test' } },
    } as any;

    mockConstructEvent.mockReturnValue(event);

    // Set up to return an already-processed event
    setSkipProcessing(true);

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        body: 'test-body',
        headers: { 'stripe-signature': 'sig_test' },
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.received).toBe(true);

    expect(mockConstructEvent).toHaveBeenCalled();
    // Insert was attempted (returned empty due to conflict)
    expect(mockDbInsert).toHaveBeenCalled();
    // Select was called to check existing record
    expect(mockDbSelect).toHaveBeenCalled();
    // Should not call handler for duplicate events
    expect(mockHandlerHandle).not.toHaveBeenCalled();
  });

  it('retries processing for existing unprocessed event (prior handler failure path)', async () => {
    const event = {
      id: 'evt_unprocessed_retry',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cs_unproc' } },
    } as any;

    mockConstructEvent.mockReturnValue(event);
    setSkipProcessing(true); // forces insert conflict path
    setSimulateUnprocessedRetry(true); // select returns unprocessed record

    // Provide a handler that succeeds
    const mockHandler = {
      eventTypes: ['checkout.session.completed'] as const,
      handle: mockHandlerHandle,
    };
    mockGetHandler.mockReturnValue(mockHandler);
    mockHandlerHandle.mockResolvedValue({ success: true });

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        body: 'test-body',
        headers: { 'stripe-signature': 'sig_test' },
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.received).toBe(true);

    // Selected existing unprocessed, used its id, called handler, then marked processed via update
    expect(mockDbSelect).toHaveBeenCalled();
    expect(mockHandlerHandle).toHaveBeenCalled();
    expect(mockDbUpdate).toHaveBeenCalled();
  });

  it('returns 500 and captures critical error on data race (record disappears after conflict)', async () => {
    const event = {
      id: 'evt_disappear',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cs_race' } },
    } as any;

    mockConstructEvent.mockReturnValue(event);
    setSkipProcessing(true);
    setSimulateRaceDisappear(true); // select after conflict returns no row

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        body: 'test-body',
        headers: { 'stripe-signature': 'sig_test' },
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Webhook processing failed');

    // The processing catch captures the specific race error
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Stripe webhook processing failed',
      expect.objectContaining({
        message: expect.stringContaining('Webhook record disappeared'),
      }),
      expect.objectContaining({
        eventId: 'evt_disappear',
      })
    );
  });

  it('acknowledges a duplicate while another request holds the processing lease', async () => {
    const event = {
      id: 'evt_active_lease',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cs_active_lease' } },
    } as any;

    mockConstructEvent.mockReturnValue(event);
    setSimulateActiveLease(true);

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        body: 'test-body',
        headers: { 'stripe-signature': 'sig_test' },
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect((await response.json()).received).toBe(true);
    expect(mockHandlerHandle).not.toHaveBeenCalled();
  });

  it('does not clear another worker lease when its own claim fails', async () => {
    const event = {
      id: 'evt_failed_claim',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cs_failed_claim' } },
    } as any;

    mockConstructEvent.mockReturnValue(event);
    setSimulateLeaseClaimFailure(true);

    const response = await POST(
      new NextRequest('http://localhost:3000/api/stripe/webhooks', {
        method: 'POST',
        body: 'test-body',
        headers: { 'stripe-signature': 'sig_test' },
      })
    );

    expect(response.status).toBe(500);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(mockHandlerHandle).not.toHaveBeenCalled();
  });
});

describe('/api/stripe/webhooks - Method Guard', () => {
  it('rejects GET with 405 Method Not Allowed (only POST for webhooks)', async () => {
    const { GET } = await import('@/app/api/stripe/webhooks/route');

    const response = await GET();
    expect(response.status).toBe(405);
    const data = await response.json();
    expect(data.error).toBe('Method not allowed');
  });
});

describe('/api/stripe/webhooks - Outer Error Boundary', () => {
  it('hits outer catch (and returns 500) for unexpected errors after signature verification but before processing try (e.g. timestamp util failure)', async () => {
    const event = {
      id: 'evt_outer_catch',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cs_outer' } },
    } as any;

    mockConstructEvent.mockReturnValue(event);
    // Force timestamp conversion (called before inner processing try) to throw -> outer catch
    mockStripeTimestampToDate.mockImplementation(() => {
      throw new Error('timestamp conversion failed (simulated)');
    });

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        body: 'test-body',
        headers: { 'stripe-signature': 'sig_test' },
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Webhook processing failed');

    // Outer catch path
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Stripe webhook processing failed',
      expect.any(Error),
      expect.objectContaining({ route: '/api/stripe/webhooks' })
    );
  });
});

describe('/api/stripe/webhooks - Config Guard (missing secret)', () => {
  it('returns 500 and captures critical error when STRIPE_WEBHOOK_SECRET is missing (early guard before signature)', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env-server', () => ({
      env: {
        STRIPE_WEBHOOK_SECRET: undefined,
      },
    }));

    const { POST } = await import('@/app/api/stripe/webhooks/route');

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        body: 'test-body',
        headers: { 'stripe-signature': 'sig_test' },
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Webhook not configured');

    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'STRIPE_WEBHOOK_SECRET is not configured — production webhooks are broken',
      expect.any(Error),
      expect.objectContaining({ route: '/api/stripe/webhooks' })
    );
  });
});
