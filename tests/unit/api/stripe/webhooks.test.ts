import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/stripe/webhooks/route';

// Hoisted mocks
const {
  mockConstructEvent,
  mockInsert,
  mockRetrieve,
  mockUpdateBilling,
  mockGetPlanFromPriceId,
  mockWithTransaction,
} = vi.hoisted(() => {
  const mockGetPlan = vi.fn<(priceId: string) => string | null>(
    () => 'standard'
  );

  const mockTx = vi.fn(async (callback: any) => {
    return await callback({
      insert: mockInsert,
    });
  });

  return {
    mockConstructEvent: vi.fn(),
    mockInsert: vi.fn(() => ({
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([{ id: 'webhook-1' }]),
    })),
    mockRetrieve: vi.fn(),
    mockUpdateBilling: vi.fn(),
    mockGetPlanFromPriceId: mockGetPlan,
    mockWithTransaction: mockTx,
  };
});

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    webhooks: {
      constructEvent: mockConstructEvent,
    },
    subscriptions: {
      retrieve: mockRetrieve,
    },
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: mockInsert,
  },
  users: { clerkId: 'clerk_id_column' },
  stripeWebhookEvents: {},
  withTransaction: mockWithTransaction,
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateBilling,
}));
vi.mock('@/lib/stripe/config', () => ({
  getPlanFromPriceId: mockGetPlanFromPriceId,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

const { headers } = await import('next/headers');

describe('/api/stripe/webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
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

  it('processes a new checkout.session.completed event and records webhook', async () => {
    vi.mocked(headers).mockResolvedValue(
      new Map([['stripe-signature', 'sig_test']]) as any
    );

    const event = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test',
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: { clerk_user_id: 'user_123' },
        },
      },
    } as any;

    mockConstructEvent.mockReturnValue(event);
    mockInsert.mockReturnValue({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve([{ id: 'webhook_row_id' }]),
        }),
      }),
    });

    mockRetrieve.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      customer: 'cus_123',
      items: { data: [{ price: { id: 'price_123' } }] },
      metadata: { clerk_user_id: 'user_123' },
    } as any);

    mockUpdateBilling.mockResolvedValue({ success: true });

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        body: 'test-body',
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.received).toBe(true);

    expect(mockInsert).toHaveBeenCalled();
    expect(mockConstructEvent).toHaveBeenCalled();
    expect(mockUpdateBilling).toHaveBeenCalled();
    expect(mockGetPlanFromPriceId).toHaveBeenCalledWith('price_123');
  });

  it('returns 500 when subscription price ID is unknown', async () => {
    vi.mocked(headers).mockResolvedValue(
      new Map([['stripe-signature', 'sig_test']]) as any
    );

    const event = {
      id: 'evt_unknown',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_unknown',
          customer: 'cus_123',
          subscription: 'sub_unknown',
          metadata: { clerk_user_id: 'user_123' },
        },
      },
    } as any;

    mockConstructEvent.mockReturnValue(event);
    mockInsert.mockReturnValue({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve([{ id: 'webhook_row_id' }]),
        }),
      }),
    });

    mockRetrieve.mockResolvedValue({
      id: 'sub_unknown',
      status: 'active',
      customer: 'cus_123',
      items: { data: [{ price: { id: 'price_unknown' } }] },
      metadata: { clerk_user_id: 'user_123' },
    } as any);

    mockGetPlanFromPriceId.mockReturnValueOnce(null);

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        body: 'test-body',
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Webhook processing failed');

    expect(mockInsert).toHaveBeenCalled();
    expect(mockConstructEvent).toHaveBeenCalled();
    expect(mockRetrieve).toHaveBeenCalled();
    expect(mockGetPlanFromPriceId).toHaveBeenCalledWith('price_unknown');
  });

  it('skips processing for duplicate events', async () => {
    vi.mocked(headers).mockResolvedValue(
      new Map([['stripe-signature', 'sig_test']]) as any
    );

    const event = {
      id: 'evt_duplicate',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_test' } },
    } as any;

    mockConstructEvent.mockReturnValue(event);
    mockInsert.mockReturnValue({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    });

    const request = new NextRequest(
      'http://localhost:3000/api/stripe/webhooks',
      {
        method: 'POST',
        body: 'test-body',
      }
    );

    const response = await POST(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.received).toBe(true);

    expect(mockConstructEvent).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockUpdateBilling).not.toHaveBeenCalled();
  });
});
