import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/capture-tip/route';

const { mockHeaders, mockInsert, mockSelect } = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
    select: mockSelect,
  },
  creatorProfiles: {
    id: 'id_column',
    usernameNormalized: 'username_normalized',
  },
  tips: { id: 'id_column', paymentIntentId: 'payment_intent_id' },
}));

vi.mock('stripe', () => {
  class StripeMock {
    webhooks = {
      constructEvent: vi.fn(),
    };
  }
  return { default: StripeMock };
});

describe('/api/capture-tip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.STRIPE_TIP_WEBHOOK_SECRET = 'whsec_test';
  });

  it('returns 400 when signature is missing', async () => {
    mockHeaders.mockResolvedValue(new Map() as any);

    const request = new NextRequest('http://localhost:3000/api/capture-tip', {
      method: 'POST',
      body: 'test-body',
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('No signature');
  });

  it('persists a new tip for payment_intent.succeeded', async () => {
    mockHeaders.mockResolvedValue(
      new Map([['stripe-signature', 'sig_test']]) as any
    );

    const stripeModule = await import('stripe');
    const stripeInstance: any = new (stripeModule as any).default('sk_test');
    const event = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          amount_received: 500,
          currency: 'usd',
          metadata: { handle: 'artist' },
          charges: {
            data: [
              {
                billing_details: {
                  email: 'fan@example.com',
                  phone: '+15555555555',
                },
              },
            ],
          },
        },
      },
    } as any;

    stripeInstance.webhooks.constructEvent = vi.fn().mockReturnValue(event);

    (stripeModule as any).default = vi.fn(() => stripeInstance);

    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: 'creator_1' }]),
        }),
      }),
    });

    mockInsert.mockReturnValue({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve([{ id: 'tip_1' }]),
        }),
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/capture-tip', {
      method: 'POST',
      body: 'test-body',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.received).toBe(true);

    expect(mockSelect).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });
});
