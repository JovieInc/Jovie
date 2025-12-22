import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/stripe/webhooks/route';

// Hoisted mocks - these need to be defined before vi.mock calls
// Track if event should be skipped (already processed)
let skipProcessing = false;

const {
  mockConstructEvent,
  mockRetrieve,
  mockUpdateBilling,
  mockGetPlanFromPriceId,
  mockWithTransaction,
} = vi.hoisted(() => {
  const mockGetPlan = vi.fn<(priceId: string) => string | null>(
    () => 'standard'
  );

  const mockTx = vi.fn(async (callback: any) => {
    // Create a mock transaction context
    const txContext = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve(
                skipProcessing
                  ? [{ id: 'existing-id', processedAt: new Date() }]
                  : []
              )
            ),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'webhook-1' }])),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
    };

    try {
      const result = await callback(txContext);
      return { data: result, error: null };
    } catch (error) {
      return { data: null, error };
    }
  });

  return {
    mockConstructEvent: vi.fn(),
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
  db: {},
  users: {
    clerkId: 'clerk_id_column',
    stripeCustomerId: 'stripe_customer_id_column',
  },
  stripeWebhookEvents: {
    id: 'id',
    stripeEventId: 'stripe_event_id',
    processedAt: 'processed_at',
  },
  withTransaction: mockWithTransaction,
}));

vi.mock('@/lib/db/schema', () => ({
  users: {
    clerkId: 'clerk_id_column',
    stripeCustomerId: 'stripe_customer_id_column',
  },
  stripeWebhookEvents: {
    id: 'id',
    stripeEventId: 'stripe_event_id',
    processedAt: 'processed_at',
  },
}));

vi.mock('@/lib/stripe/customer-sync', () => ({
  updateUserBillingStatus: mockUpdateBilling,
}));

vi.mock('@/lib/stripe/config', () => ({
  getPlanFromPriceId: mockGetPlanFromPriceId,
}));

vi.mock('@/lib/env-server', () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
  },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureCriticalError: vi.fn(),
  captureWarning: vi.fn(),
  logFallback: vi.fn(),
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
    skipProcessing = false;
    mockGetPlanFromPriceId.mockReturnValue('standard');
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
      created: Math.floor(Date.now() / 1000),
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

    expect(mockConstructEvent).toHaveBeenCalled();
    expect(mockWithTransaction).toHaveBeenCalled();
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
      created: Math.floor(Date.now() / 1000),
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

    mockRetrieve.mockResolvedValue({
      id: 'sub_unknown',
      status: 'active',
      customer: 'cus_123',
      items: { data: [{ price: { id: 'price_unknown' } }] },
      metadata: { clerk_user_id: 'user_123' },
    } as any);

    // Return null for unknown price ID
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

    expect(mockConstructEvent).toHaveBeenCalled();
    expect(mockWithTransaction).toHaveBeenCalled();
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
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: 'cs_test' } },
    } as any;

    mockConstructEvent.mockReturnValue(event);

    // Set up to return an already-processed event
    skipProcessing = true;

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
    expect(mockWithTransaction).toHaveBeenCalled();
    // Should not call retrieve or update for duplicate events
    expect(mockRetrieve).not.toHaveBeenCalled();
    expect(mockUpdateBilling).not.toHaveBeenCalled();
  });
});
