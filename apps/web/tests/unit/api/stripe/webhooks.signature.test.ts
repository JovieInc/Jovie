/**
 * Stripe Webhooks Tests - Signature Verification
 */
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockCaptureCriticalError,
  mockConstructEvent,
  mockGetHandler,
  mockGetPlanFromPriceId,
  setSkipProcessing,
} from './webhooks.test-utils';

// Matches the mocked STRIPE_WEBHOOK_SECRET in webhooks.test-utils.ts.
const expectedSecretFingerprint = createHash('sha256')
  .update('whsec_test')
  .digest('hex')
  .slice(0, 12);

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
    expect(mockCaptureCriticalError).not.toHaveBeenCalled();
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
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Invalid Stripe webhook signature',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/stripe/webhooks',
        error_class: 'stripe_signature_verification_failed',
        endpointMode: 'test',
        webhookSecretFingerprint: expectedSecretFingerprint,
      })
    );
  });

  it('attaches unverified event ID and signature metadata for attribution', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new SyntaxError('Invalid signature');
    });

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        body: '{"id":"evt_unverified_123","type":"invoice.paid"}',
        headers: { 'stripe-signature': 't=1725123456,v1=abc,v1=def' },
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Invalid Stripe webhook signature',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/stripe/webhooks',
        unverifiedEventId: 'evt_unverified_123',
        signatureTimestamp: '1725123456',
        signatureSchemeCount: 2,
        endpointMode: 'test',
      })
    );
  });

  it('omits the unverified event ID when the body is not JSON', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new SyntaxError('Invalid signature');
    });

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        body: 'not-json',
        headers: { 'stripe-signature': 'sig_invalid' },
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mockCaptureCriticalError).toHaveBeenCalledWith(
      'Invalid Stripe webhook signature',
      expect.any(Error),
      expect.objectContaining({
        route: '/api/stripe/webhooks',
        unverifiedEventId: undefined,
        endpointMode: 'test',
      })
    );
  });
});
