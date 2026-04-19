/**
 * Stripe Webhooks Tests - Signature Verification
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockConstructEvent,
  mockGetHandler,
  mockGetOperationalControls,
  mockGetPlanFromPriceId,
  setSkipProcessing,
} from './webhooks.test-utils';

const { POST } = await import('@/app/api/stripe/webhooks/route');

describe('/api/stripe/webhooks - Signature Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSkipProcessing(false);
    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockGetHandler.mockReturnValue(null);
  });

  it('returns 400 when signature header is missing', async () => {
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
    expect(mockGetOperationalControls).not.toHaveBeenCalled();
  });

  it('returns 400 when signature is invalid', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new SyntaxError('Invalid signature');
    });

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        body: 'test-body',
        headers: { 'stripe-signature': 'sig_invalid' },
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Invalid signature');
    expect(mockGetOperationalControls).not.toHaveBeenCalled();
  });

  it('returns 503 after signature verification when webhook processing is disabled', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_disabled',
      type: 'checkout.session.completed',
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cs_disabled' } },
    } as never);
    mockGetOperationalControls.mockResolvedValueOnce({
      signupEnabled: true,
      checkoutEnabled: true,
      stripeWebhooksEnabled: false,
      cronFanoutEnabled: true,
      updatedAt: null,
      updatedByUserId: null,
    });

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        body: 'test-body',
        headers: { 'stripe-signature': 'sig_valid' },
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('30');
    await expect(response.json()).resolves.toEqual({
      error:
        'Webhook processing is temporarily paused. Stripe should retry this event shortly.',
    });
    expect(mockConstructEvent).toHaveBeenCalledTimes(1);
    expect(mockGetOperationalControls).toHaveBeenCalledTimes(1);
  });
});
