import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/capture-tip/route';

const { mockHeaders, mockInsert, mockSelect, mockStripeConstructEvent } =
  vi.hoisted(() => ({
    mockHeaders: vi.fn(),
    mockInsert: vi.fn(),
    mockSelect: vi.fn(),
    mockStripeConstructEvent: vi.fn(),
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
  const StripeMock = vi.fn().mockImplementation(function (this: any) {
    this.webhooks = {
      constructEvent: mockStripeConstructEvent,
    };
  });
  return { __esModule: true, default: StripeMock };
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

    mockStripeConstructEvent.mockReturnValue(event);

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

  it('returns 500 when creator profile not found (CRITICAL bug prevention)', async () => {
    mockHeaders.mockResolvedValue(
      new Map([['stripe-signature', 'sig_test']]) as any
    );

    const event = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_456',
          amount_received: 1000,
          currency: 'usd',
          metadata: { handle: 'deleted_artist' },
        },
      },
    } as any;

    mockStripeConstructEvent.mockReturnValue(event);

    // Simulate creator profile not found
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]), // Empty array = no profile
        }),
      }),
    });

    const request = new NextRequest('http://localhost:3000/api/capture-tip', {
      method: 'POST',
      body: 'test-body',
    });

    const response = await POST(request);

    // MUST return 500 to trigger Stripe retry, preventing silent payment loss
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Creator profile not found');
    expect(data.payment_intent).toBe('pi_456');

    // Should not attempt to insert tip when profile missing
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('handles duplicate tip events via onConflictDoNothing', async () => {
    mockHeaders.mockResolvedValue(
      new Map([['stripe-signature', 'sig_test']]) as any
    );

    const event = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_duplicate',
          amount_received: 500,
          currency: 'usd',
          metadata: { handle: 'artist' },
        },
      },
    } as any;

    mockStripeConstructEvent.mockReturnValue(event);

    mockSelect.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: 'creator_1' }]),
        }),
      }),
    });

    // Simulate duplicate: onConflictDoNothing returns empty array
    mockInsert.mockReturnValue({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve([]), // Empty = conflict, no insert
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
  });

  it('ignores non-payment_intent.succeeded events', async () => {
    mockHeaders.mockResolvedValue(
      new Map([['stripe-signature', 'sig_test']]) as any
    );

    const event = {
      type: 'payment_intent.created', // Different event type
      data: {
        object: {
          id: 'pi_789',
        },
      },
    } as any;

    mockStripeConstructEvent.mockReturnValue(event);

    const request = new NextRequest('http://localhost:3000/api/capture-tip', {
      method: 'POST',
      body: 'test-body',
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    // Should not query database for non-succeeded events
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
