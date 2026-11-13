import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userId: 'app-user-1' as string | null,
  entitlement: {
    userId: 'app-user-1',
    plan: 'pro',
    isPro: true,
    billingVerification: 'verified',
  },
  billing: {
    success: true,
    data: {
      stripeSubscriptionId: 'sub_current',
      stripeCustomerId: 'cus_current',
    },
  },
  session: {} as Record<string, unknown>,
  retrieveError: null as Error | null,
  mappedPlan: null as string | null,
  profileRows: [] as Array<{
    isClaimed: boolean | null;
    isPublic?: boolean | null;
    username?: string | null;
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

vi.mock('@/lib/entitlements/server', () => ({
  getCurrentUserEntitlements: async () => mocks.entitlement,
}));
vi.mock('@/lib/stripe/customer-sync', () => ({
  getUserBillingInfo: async () => mocks.billing,
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: async () => ({ userId: mocks.userId }),
}));
vi.mock('@/lib/stripe/client', () => ({
  stripe: {
    checkout: {
      sessions: {
        retrieve: async () => {
          if (mocks.retrieveError) throw mocks.retrieveError;
          return mocks.session;
        },
      },
    },
  },
}));
vi.mock('@/lib/stripe/config', () => ({
  getPriceMappingDetails: () =>
    mocks.mappedPlan ? { plan: mocks.mappedPlan } : null,
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
    mocks.retrieveError = null;
    mocks.mappedPlan = null;
    mocks.entitlement = {
      userId: 'app-user-1',
      plan: 'pro',
      isPro: true,
      billingVerification: 'verified',
    };
    mocks.billing = {
      success: true,
      data: {
        stripeSubscriptionId: 'sub_current',
        stripeCustomerId: 'cus_current',
      },
    };
    mocks.session = {
      id: 'cs_test_1',
      payment_status: 'paid',
      customer: 'cus_current',
      subscription: {
        id: 'sub_current',
        status: 'active',
        customer: 'cus_current',
        items: { data: [{ price: { id: 'price_pro' } }] },
      },
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
    expect(body).toMatchObject({
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
  it('does not declare an unpaid completed checkout confirmed', async () => {
    mocks.session.payment_status = 'unpaid';
    const { GET } = await import('@/app/api/billing/checkout-session/route');
    const body = await (await GET(request())).json();
    expect(body).toMatchObject({ status: 'pending', plan: null });
    expect(mocks.recordedStages).toEqual([]);
  });

  it.each([
    { plan: 'free', isPro: false, billingVerification: 'verified' },
    { plan: 'pro', isPro: false, billingVerification: 'verified' },
    { plan: 'pro', isPro: true, billingVerification: 'unavailable' },
    { plan: 'max', isPro: true, billingVerification: 'verified' },
  ])('waits for reconciled matching entitlement: %j', async entitlement => {
    mocks.entitlement = { userId: 'app-user-1', ...entitlement };
    const { GET } = await import('@/app/api/billing/checkout-session/route');
    expect(await (await GET(request())).json()).toMatchObject({
      status: 'pending',
      plan: null,
    });
    expect(mocks.recordedStages).toEqual([]);
  });

  it.each(['canceled', 'unpaid', 'past_due', 'incomplete_expired', 'paused'])(
    'rejects a historical %s subscription',
    async status => {
      mocks.session.subscription = { id: 'sub_current', status };
      const { GET } = await import('@/app/api/billing/checkout-session/route');
      expect(await (await GET(request())).json()).toMatchObject({
        status: 'unconfirmed',
        plan: null,
      });
    }
  );

  it('does not use an old checkout for a different current subscription', async () => {
    mocks.billing.data.stripeSubscriptionId = 'sub_new';
    const { GET } = await import('@/app/api/billing/checkout-session/route');
    expect(await (await GET(request())).json()).toMatchObject({
      status: 'pending',
      plan: null,
    });
  });

  it.each(['active', 'trialing'])(
    'accepts no-payment-required checkout with a reconciled %s subscription',
    async status => {
      mocks.session.payment_status = 'no_payment_required';
      mocks.session.amount_total = 0;
      mocks.session.subscription = {
        id: 'sub_current',
        status,
        customer: 'cus_current',
        items: { data: [{ price: { id: 'price_pro' } }] },
      };
      const { GET } = await import('@/app/api/billing/checkout-session/route');
      expect(await (await GET(request())).json()).toMatchObject({
        status: 'confirmed',
        plan: 'pro',
        paymentStatus: 'no_payment_required',
      });
    }
  );
  it.each(['open', 'expired', null])(
    'does not certify a %s checkout',
    async status => {
      mocks.session.status = status;
      const { GET } = await import('@/app/api/billing/checkout-session/route');
      expect(await (await GET(request())).json()).toMatchObject({
        status: 'unconfirmed',
        plan: null,
      });
    }
  );

  it.each([
    null,
    'sub_unexpanded',
    { id: 'sub_current', status: 'incomplete' },
  ])(
    'does not certify missing/incomplete subscription evidence: %j',
    async subscription => {
      mocks.session.subscription = subscription;
      const { GET } = await import('@/app/api/billing/checkout-session/route');
      expect(await (await GET(request())).json()).toMatchObject({
        status: 'unconfirmed',
        plan: null,
      });
    }
  );

  it('does not confirm stale price or customer correlation', async () => {
    const { GET } = await import('@/app/api/billing/checkout-session/route');
    mocks.session.customer = 'cus_other';
    expect(await (await GET(request())).json()).toMatchObject({
      status: 'pending',
      plan: null,
    });
    mocks.session.customer = 'cus_current';
    mocks.session.line_items = { data: [{ price: { id: 'price_previous' } }] };
    expect(await (await GET(request())).json()).toMatchObject({
      status: 'pending',
      plan: null,
    });
  });

  it('fails closed when the canonical billing lookup is unavailable', async () => {
    mocks.billing.success = false;
    const { GET } = await import('@/app/api/billing/checkout-session/route');
    const res = await GET(request());
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ status: 'pending', plan: null });
  });

  it('retains the mapped-price fallback and legacy plan alias', async () => {
    mocks.session.metadata = { clerk_user_id: 'app-user-1' };
    mocks.mappedPlan = 'founding';
    const { GET } = await import('@/app/api/billing/checkout-session/route');
    expect(await (await GET(request())).json()).toMatchObject({
      status: 'confirmed',
      plan: 'pro',
    });
  });

  it('retains a canonical trial entitlement without asserting money changed hands', async () => {
    mocks.session.metadata = { clerk_user_id: 'app-user-1', plan: 'trial' };
    mocks.entitlement.plan = 'trial';
    mocks.session.payment_status = 'no_payment_required';
    const { GET } = await import('@/app/api/billing/checkout-session/route');
    expect(await (await GET(request())).json()).toMatchObject({
      status: 'confirmed',
      plan: 'trial',
      paymentStatus: 'no_payment_required',
    });
  });

  it('keeps canonical trial access for a trialing subscription with a paid-plan price', async () => {
    mocks.entitlement.plan = 'trial';
    mocks.mappedPlan = 'pro';
    mocks.session.payment_status = 'no_payment_required';
    mocks.session.subscription = {
      ...(mocks.session.subscription as Record<string, unknown>),
      status: 'trialing',
    };
    const { GET } = await import('@/app/api/billing/checkout-session/route');
    expect(await (await GET(request())).json()).toMatchObject({
      status: 'confirmed',
      plan: 'trial',
      paymentStatus: 'no_payment_required',
    });
  });

  it('does not certify unsupported payment status', async () => {
    mocks.session.payment_status = null;
    const { GET } = await import('@/app/api/billing/checkout-session/route');
    expect(await (await GET(request())).json()).toMatchObject({
      status: 'unconfirmed',
      plan: null,
    });
  });

  it('returns failure, never success, when session retrieval fails', async () => {
    mocks.retrieveError = new Error('not found');
    const { GET } = await import('@/app/api/billing/checkout-session/route');
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty('plan', 'pro');
  });

  it('requires an authenticated user and a valid session ID', async () => {
    const { GET } = await import('@/app/api/billing/checkout-session/route');
    mocks.userId = null;
    expect((await GET(request())).status).toBe(401);
    mocks.userId = 'app-user-1';
    expect(
      (
        await GET(
          new NextRequest(
            'http://localhost/api/billing/checkout-session?session_id=invalid'
          )
        )
      ).status
    ).toBe(400);
  });
});
