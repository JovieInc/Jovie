import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  interval: undefined as string | undefined,
  profile: vi.fn(),
  hasOfferState: vi.fn(),
  recordOfferEvent: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [],
    get: () => (mocks.interval ? { value: mocks.interval } : undefined),
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error('redirect:' + url);
  },
}));
vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardData: mocks.profile,
}));
vi.mock('@/lib/auth/gate', () => ({
  CanonicalUserState: { UNAUTHENTICATED: 'logged_out' },
  resolveUserState: async () => ({ clerkUserId: 'user', state: 'active' }),
  getRedirectForState: () => '/app',
}));
vi.mock('@/lib/auth/plan-intent', () => ({
  DEFAULT_UPSELL_PLAN: 'pro',
  getPlanIntentFromCookies: () => null,
  isPaidIntent: (plan: string) => plan === 'pro' || plan === 'max',
  recommendPlan: () => 'pro',
  validatePlan: (plan: string) => plan,
}));
vi.mock('@/lib/config/pricing', () => ({
  PRICING: { pro: { monthly: { priceId: 'price_visibility', amount: 19900 } } },
}));
vi.mock('@/lib/onboarding/upgrade-offer', () => ({
  hasOnboardingUpgradeOfferState: mocks.hasOfferState,
  recordOnboardingUpgradeOfferEvent: mocks.recordOfferEvent,
}));
vi.mock('./OnboardingCheckoutClient', () => ({
  OnboardingCheckoutClient: () => null,
}));

import Page from './page';

beforeEach(() => {
  mocks.interval = undefined;
  mocks.profile.mockReset().mockResolvedValue({ selectedProfile: null });
  mocks.hasOfferState.mockReset().mockResolvedValue(false);
  mocks.recordOfferEvent.mockReset().mockResolvedValue({ ok: true });
});
it.each(['year', 'annual', 'weekly'])(
  'rejects explicit unsupported interval %s before checkout',
  async interval => {
    await expect(
      Page({ searchParams: Promise.resolve({ plan: 'pro', interval }) })
    ).rejects.toThrow('redirect:/pricing');
    expect(mocks.profile).not.toHaveBeenCalled();
  }
);
it('rejects stale annual cookie after onboarding', async () => {
  mocks.interval = 'year';
  await expect(
    Page({ searchParams: Promise.resolve({ plan: 'pro' }) })
  ).rejects.toThrow('redirect:/pricing');
});
it('rejects retired Max instead of silently purchasing Pro', async () => {
  await expect(
    Page({ searchParams: Promise.resolve({ plan: 'max' }) })
  ).rejects.toThrow('redirect:/pricing');
});
it('passes only the current monthly price to checkout', async () => {
  const page = await Page({
    searchParams: Promise.resolve({ plan: 'pro', interval: 'month' }),
  });
  expect(page.props).toMatchObject({
    monthlyPriceId: 'price_visibility',
    monthlyAmount: 19900,
    annualPriceId: null,
    annualAmount: null,
  });
});

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE = {
  id: PROFILE_ID,
  displayName: 'Test Artist',
  username: 'testartist',
  avatarUrl: null,
  spotifyFollowers: null,
};

it('records offer seen and renders for a first-time claimed artist', async () => {
  mocks.profile.mockResolvedValue({ selectedProfile: PROFILE });
  await Page({ searchParams: Promise.resolve({ plan: 'pro' }) });
  expect(mocks.recordOfferEvent).toHaveBeenCalledWith(
    PROFILE_ID,
    'seen',
    'pro'
  );
});

it('shows the offer exactly once: a prior receipt skips the upsell', async () => {
  mocks.profile.mockResolvedValue({ selectedProfile: PROFILE });
  mocks.hasOfferState.mockResolvedValue(true);
  await expect(
    Page({ searchParams: Promise.resolve({ plan: 'pro' }) })
  ).rejects.toThrow(/^redirect:/);
  expect(mocks.recordOfferEvent).not.toHaveBeenCalled();
});

it('still serves artist-initiated paid intent even after the offer was seen', async () => {
  mocks.profile.mockResolvedValue({ selectedProfile: PROFILE });
  mocks.hasOfferState.mockResolvedValue(true);
  const page = await Page({
    searchParams: Promise.resolve({ plan: 'pro', source: 'intent' }),
  });
  expect(page.props).toMatchObject({
    plan: 'pro',
    profileId: PROFILE_ID,
  });
  // Intent-driven checkout is not an offer impression.
  expect(mocks.recordOfferEvent).not.toHaveBeenCalled();
});
