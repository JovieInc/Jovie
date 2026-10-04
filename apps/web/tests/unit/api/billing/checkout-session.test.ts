import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userId: 'app-user-1' as string | null,
  session: {} as Record<string, unknown>,
  profileRows: [] as Array<{ isClaimed: boolean | null }>,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: mocks.userId }),
}));
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    checkout: { sessions: { retrieve: async () => mocks.session } },
  },
}));
vi.mock('@/lib/stripe/config', () => ({
  getPriceMappingDetails: () => null,
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({ limit: async () => mocks.profileRows }),
        }),
      }),
    }),
  },
}));

function request() {
  return new NextRequest(
    'http://localhost/api/billing/checkout-session?session_id=cs_test_1'
  );
}

describe('GET /api/billing/checkout-session', () => {
  beforeEach(() => {
    mocks.userId = 'app-user-1';
    mocks.session = {
      mode: 'subscription',
      status: 'complete',
      metadata: { clerk_user_id: 'app-user-1', plan: 'pro' },
      line_items: { data: [{ price: { id: 'price_pro' } }] },
    };
    mocks.profileRows = [{ isClaimed: true }];
  });

  it('marks a paid buyer without a claimed profile as needing one', async () => {
    mocks.profileRows = [{ isClaimed: null }];
    const { GET } = await import('@/app/api/billing/checkout-session/route');

    const body = await (await GET(request())).json();
    expect(body).toEqual({
      plan: 'pro',
      priceId: 'price_pro',
      needsProfile: true,
    });
  });

  it('keeps a buyer with a claimed profile on the normal path', async () => {
    const { GET } = await import('@/app/api/billing/checkout-session/route');

    const body = await (await GET(request())).json();
    expect(body.needsProfile).toBe(false);
  });

  it('never reveals another user’s session', async () => {
    mocks.session = {
      ...mocks.session,
      metadata: { clerk_user_id: 'someone-else', plan: 'pro' },
    };
    const { GET } = await import('@/app/api/billing/checkout-session/route');

    const response = await GET(request());
    expect(response.status).toBe(404);
  });
});
