import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.hoisted(() => vi.fn());
const mockStripePortalCreate = vi.hoisted(() => vi.fn());
const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    billingPortal: {
      sessions: {
        create: mockStripePortalCreate,
      },
    },
  },
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  users: {},
}));

describe('POST /api/stripe/portal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue({ userId: null });

    const { POST } = await import('@/app/api/stripe/portal/route');
    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 when user has no Stripe customer ID', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ stripeCustomerId: null }]),
        }),
      }),
    });

    const { POST } = await import('@/app/api/stripe/portal/route');
    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('customer');
  });

  it('creates portal session for user with Stripe customer', async () => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ stripeCustomerId: 'cus_123' }]),
        }),
      }),
    });
    mockStripePortalCreate.mockResolvedValue({
      id: 'bps_123',
      url: 'https://billing.stripe.com/session/bps_123',
    });

    const { POST } = await import('@/app/api/stripe/portal/route');
    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBeDefined();
  });
});
