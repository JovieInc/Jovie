/**
 * Stripe Webhooks Tests - Signature Verification
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/stripe/webhooks/route';
import {
  mockConstructEvent,
  mockGetHandler,
  mockGetPlanFromPriceId,
  setSkipProcessing,
} from './webhooks.test-utils';

const { headers } = await import('next/headers');

describe('/api/stripe/webhooks - Signature Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSkipProcessing(false);
    mockGetPlanFromPriceId.mockReturnValue('standard');
    mockGetHandler.mockReturnValue(null);
  });

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
