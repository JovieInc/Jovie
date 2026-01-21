/**
 * Stripe Webhooks Tests - Idempotency Handling
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWebhookPostHandler,
  mockConstructEvent,
  mockGetHandler,
  mockGetPlanFromPriceId,
  mockHandlerHandle,
  mockWithTransaction,
  setSkipProcessing,
} from './webhooks.test-utils';

describe('/api/stripe/webhooks - Idempotency Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSkipProcessing(false);
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
        headers: {
          'stripe-signature': 'sig_test',
        },
      }
    );

    const POST = await getWebhookPostHandler();
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
