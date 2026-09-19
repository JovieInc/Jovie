import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  interval: undefined as string | undefined,
  profile: vi.fn(),
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
vi.mock('./OnboardingCheckoutClient', () => ({
  OnboardingCheckoutClient: () => null,
}));

import Page from './page';

beforeEach(() => {
  mocks.interval = undefined;
  mocks.profile.mockReset().mockResolvedValue({ selectedProfile: null });
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
