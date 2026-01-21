import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockStripePaymentIntentsCreate = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => vi.fn());

vi.mock('stripe', () => {
  const Stripe = vi.fn().mockImplementation(function (this: any) {
    this.paymentIntents = {
      create: mockStripePaymentIntentsCreate,
    };
  });
  return { __esModule: true, default: Stripe };
});

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/rate-limit', () => ({
  paymentIntentLimiter: {
    limit: vi.fn().mockResolvedValue({ success: true }),
  },
  createRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

describe('POST /api/create-tip-intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.STRIPE_SECRET_KEY = 'test_stripe_key';

    // Mock authenticated user by default
    mockAuth.mockResolvedValue({ userId: 'test-user-id' });
  });

  it('returns 400 for invalid amount', async () => {
    const { POST } = await import('@/app/api/create-tip-intent/route');
    const request = new NextRequest('http://localhost/api/create-tip-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: -100,
        handle: 'taylorswift',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('returns 400 for invalid handle', async () => {
    const { POST } = await import('@/app/api/create-tip-intent/route');
    const request = new NextRequest('http://localhost/api/create-tip-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 500,
        handle: 'not a handle',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('returns 500 when stripe is not configured', async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const { POST } = await import('@/app/api/create-tip-intent/route');
    const request = new NextRequest('http://localhost/api/create-tip-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 500,
        handle: 'taylorswift',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
  });

  it('creates payment intent successfully', async () => {
    mockStripePaymentIntentsCreate.mockResolvedValue({
      id: 'pi_123',
      client_secret: 'pi_123_secret',
    });

    const { POST } = await import('@/app/api/create-tip-intent/route');
    const request = new NextRequest('http://localhost/api/create-tip-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 500,
        handle: 'taylorswift',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.clientSecret).toBeDefined();
    expect(mockStripePaymentIntentsCreate).toHaveBeenCalledTimes(1);
  });
});
