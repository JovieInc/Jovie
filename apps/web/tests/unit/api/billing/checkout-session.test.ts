import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userId: 'app-user-1' as string | null,
  session: {} as Record<string, unknown>,
  profileRows: [] as Array<{
    isClaimed: boolean | null;
    isPublic?: boolean | null;
  }>,
  proofPending: false,
  recordedStages: [] as string[],
}));
vi.mock('@/lib/waitlist/golden-path-admission.server', () => ({
  hasProofPendingProfile: async () => mocks.proofPending,
}));
vi.mock('@/lib/acquisition/artist-offer-funnel.server', () => ({
  recordArtistOfferStage: async (_id: unknown, stage: string) => {
    mocks.recordedStages.push(stage);
    return true;
  },
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
    mocks.profileRows = [{ isClaimed: true, isPublic: true }];
    mocks.proofPending = false;
    mocks.recordedStages = [];
  });

  it('marks a paid buyer without a claimed profile as needing one', async () => {
    mocks.profileRows = [{ isClaimed: null }];
    const { GET } = await import('@/app/api/billing/checkout-session/route');

    const body = await (await GET(request())).json();
    expect(body).toEqual({
      plan: 'pro',
      priceId: 'price_pro',
      needsProfile: true,
      proofPending: false,
      profileShareUrl: null,
    });
  });

  it('keeps a buyer with a claimed profile on the normal path', async () => {
    const { GET } = await import('@/app/api/billing/checkout-session/route');

    const body = await (await GET(request())).json();
    expect(body.needsProfile).toBe(false);
  });

  it('hands out a share link only for a live, claimed page', async () => {
    mocks.profileRows = [
      { isClaimed: true, isPublic: true, username: 'artist' },
    ];
    const { GET } = await import('@/app/api/billing/checkout-session/route');
    const live = await (await GET(request())).json();
    expect(live.profileShareUrl).toMatch(/\/artist$/);

    mocks.profileRows = [
      { isClaimed: true, isPublic: false, username: 'artist' },
    ];
    const priv = await (await GET(request())).json();
    expect(priv.profileShareUrl).toBeNull();

    mocks.profileRows = [
      { isClaimed: true, isPublic: true, username: 'artist' },
    ];
    mocks.proofPending = true;
    const pending = await (await GET(request())).json();
    expect(pending.profileShareUrl).toBeNull();
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

  it('reports a private page waiting for proof and never records profile-live for it', async () => {
    mocks.proofPending = true;
    mocks.profileRows = [{ isClaimed: true, isPublic: false }];
    mocks.session = {
      ...mocks.session,
      metadata: {
        clerk_user_id: 'app-user-1',
        plan: 'pro',
        acquisition_id: '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f',
      },
    };
    const { GET } = await import('@/app/api/billing/checkout-session/route');

    const body = await (await GET(request())).json();
    expect(body.proofPending).toBe(true);
    // Paying never publishes: the "profile live" stage must not be recorded.
    expect(mocks.recordedStages).not.toContain('profile-live');
  });

  it('records profile-live for a public, proven page', async () => {
    mocks.session = {
      ...mocks.session,
      metadata: {
        clerk_user_id: 'app-user-1',
        plan: 'pro',
        acquisition_id: '9b0c2f4e-1d2a-4c3b-8e5f-0a1b2c3d4e5f',
      },
    };
    const { GET } = await import('@/app/api/billing/checkout-session/route');
    await GET(request());
    expect(mocks.recordedStages).toContain('profile-live');
  });
});
