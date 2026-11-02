import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanonicalUserState } from '@/lib/auth/canonical-user-state';

/**
 * Closed public signup (canon/PRODUCT.md, 2026-11-02): one test per path.
 *  1. /signup (and anonymous /start) go to the waitlist.
 *  2. Sign-in still works for existing users.
 *  3. An invite link creates the account and enters the golden path.
 */

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  resolveUserState: vi.fn(),
  resolveSyntheticPassageToken: vi.fn(),
  getCachedAuth: vi.fn(),
  getCachedCurrentUser: vi.fn(),
  redeemWaitlistInviteToken: vi.fn(),
  recordInviteOpened: vi.fn(),
  recordInviteRedeemed: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('next/server', async importOriginal => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/auth/gate', async () => ({
  ...(await vi.importActual('@/lib/auth/canonical-user-state')),
  resolveUserState: mocks.resolveUserState,
  getWaitlistAccess: vi.fn(),
}));
vi.mock('@/lib/auth/better-auth', () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue(null) } },
}));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.getCachedAuth,
  getCachedCurrentUser: mocks.getCachedCurrentUser,
}));
vi.mock('@/lib/synthetic/passage.server', () => ({
  resolveSyntheticPassage: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/synthetic/passage-token.server', () => ({
  resolveSyntheticPassageToken: mocks.resolveSyntheticPassageToken,
}));
vi.mock('@/lib/onboarding/start-entry-profile.server', () => ({
  resolveStartEntryProfile: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/onboarding/session', () => ({
  getCurrentOnboardingSessionId: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/onboarding/rate-limit', () => ({
  enforceOnboardingRateLimit: vi.fn().mockResolvedValue(undefined),
  getOnboardingRateLimitMessage: () => null,
}));
vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('@/lib/waitlist/redeem', () => ({
  redeemWaitlistInviteToken: mocks.redeemWaitlistInviteToken,
}));
vi.mock('@/lib/waitlist/invite-funnel', () => ({
  recordInviteOpened: mocks.recordInviteOpened,
  recordInviteRedeemed: mocks.recordInviteRedeemed,
}));
vi.mock('@/components/features/onboarding/OnboardingSessionBoundary', () => ({
  OnboardingSessionBoundary: () => null,
}));
vi.mock('@/app/(auth)/signup/SignUpPageClient', () => ({
  SignUpPageClient: () => null,
}));
vi.mock('@/app/(auth)/signin/SignInPageClient', () => ({
  SignInPageClient: () => null,
}));

const anonymous = { state: CanonicalUserState.UNAUTHENTICATED };

describe('closed public signup (PUBLIC_SIGNUP_CLOSED)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FEATURE_PUBLIC_SIGNUP_CLOSED = 'true';
    mocks.resolveUserState.mockResolvedValue(anonymous);
    mocks.resolveSyntheticPassageToken.mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.FEATURE_PUBLIC_SIGNUP_CLOSED;
  });

  it('defaults off so signup stays open until the flag is flipped', async () => {
    delete process.env.FEATURE_PUBLIC_SIGNUP_CLOSED;
    const { CODE_FLAGS } = await import('@/lib/flags/code-flags');
    expect(CODE_FLAGS.PUBLIC_SIGNUP_CLOSED).toBe(false);

    const { default: SignUpPage } = await import('@/app/(auth)/signup/page');
    await expect(
      SignUpPage({ searchParams: Promise.resolve({}) })
    ).resolves.toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('path 1: sends /signup, the signup modal and anonymous /start to the waitlist', async () => {
    const { default: SignUpPage } = await import('@/app/(auth)/signup/page');
    await expect(
      SignUpPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT:/waitlist');

    const { default: SignupModalPage } = await import(
      '@/app/@auth/(.)signup/page'
    );
    await expect(
      SignupModalPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT:/waitlist');

    const { default: StartPage } = await import('@/app/(dynamic)/start/page');
    await expect(
      StartPage({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT:/waitlist');
  });

  it('path 1: keeps the production certification canary on anonymous /start', async () => {
    mocks.resolveSyntheticPassageToken.mockResolvedValue({ id: 'canary' });
    const { default: StartPage } = await import('@/app/(dynamic)/start/page');
    await expect(
      StartPage({ searchParams: Promise.resolve({}) })
    ).resolves.toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('path 2: sign-in still renders for signed-out existing users', async () => {
    const { default: SignInPage } = await import('@/app/(auth)/signin/page');
    await expect(
      SignInPage({ searchParams: Promise.resolve({}) })
    ).resolves.toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('path 3: an invite link creates the account and enters the golden path', async () => {
    mocks.getCachedAuth.mockResolvedValue({ userId: 'user_invitee' });
    mocks.getCachedCurrentUser.mockResolvedValue({
      emailAddresses: [{ emailAddress: 'invitee@example.com' }],
    });
    mocks.redeemWaitlistInviteToken.mockResolvedValue({
      outcome: 'approved',
      entryId: 'entry-1',
      clerkId: 'user_invitee',
    });

    const { default: WaitlistInvitePage } = await import(
      '@/app/waitlist/invite/page'
    );
    await expect(
      WaitlistInvitePage({
        searchParams: Promise.resolve({ token: 'invite-token' }),
      })
    ).rejects.toThrow('NEXT_REDIRECT:/start?fresh_signup=true');

    expect(mocks.recordInviteOpened).toHaveBeenCalledWith('invite-token');
    expect(mocks.redeemWaitlistInviteToken).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'invite-token',
        clerkUserId: 'user_invitee',
        verifiedEmails: ['invitee@example.com'],
      })
    );
    expect(mocks.recordInviteRedeemed).toHaveBeenCalledWith({
      entryId: 'entry-1',
      appUserId: 'user_invitee',
    });

    // The redeemed (signed-in) invitee is not bounced off the golden path.
    mocks.redirect.mockClear();
    mocks.resolveUserState.mockResolvedValue({
      state: CanonicalUserState.NEEDS_ONBOARDING,
      context: { email: 'invitee@example.com' },
    });
    const { default: StartPage } = await import('@/app/(dynamic)/start/page');
    await expect(
      StartPage({ searchParams: Promise.resolve({ fresh_signup: 'true' }) })
    ).resolves.toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('path 3: an invite opened while signed out goes to sign-in, not the waitlist', async () => {
    mocks.getCachedAuth.mockResolvedValue({ userId: null });
    const { default: WaitlistInvitePage } = await import(
      '@/app/waitlist/invite/page'
    );
    await expect(
      WaitlistInvitePage({
        searchParams: Promise.resolve({ token: 'invite-token' }),
      })
    ).rejects.toThrow(/NEXT_REDIRECT:\/signin\?redirect_url=/);
    expect(mocks.recordInviteOpened).toHaveBeenCalledWith('invite-token');
  });
});
