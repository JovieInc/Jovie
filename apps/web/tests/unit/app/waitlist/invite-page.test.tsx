import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  auth: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  rateLimit: vi.fn(),
  redeem: vi.fn(),
  opened: vi.fn(),
  redeemed: vi.fn(),
}));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.auth,
  getCachedCurrentUser: mocks.currentUser,
}));
vi.mock('@/lib/onboarding/rate-limit', () => ({
  enforceOnboardingRateLimit: mocks.rateLimit,
  getOnboardingRateLimitMessage: (error: unknown) =>
    error instanceof Error && error.message.startsWith('[RATE_LIMITED] ')
      ? error.message.slice('[RATE_LIMITED] '.length)
      : null,
}));
vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));
vi.mock('@/lib/waitlist/invite-funnel', () => ({
  recordInviteOpened: mocks.opened,
  recordInviteRedeemed: mocks.redeemed,
}));
vi.mock('@/lib/waitlist/redeem', () => ({
  redeemWaitlistInviteToken: mocks.redeem,
}));

import WaitlistInvitePage from '@/app/waitlist/invite/page';

const page = (token?: string) =>
  WaitlistInvitePage({ searchParams: Promise.resolve({ token }) });

describe('WaitlistInvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.opened.mockResolvedValue(undefined);
    mocks.redeemed.mockResolvedValue(undefined);
    mocks.auth.mockResolvedValue({ userId: 'app-user-id' });
    mocks.currentUser.mockResolvedValue({
      emailVerified: true,
      emailAddresses: [{ emailAddress: 'invited@example.com' }],
    });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.rateLimit.mockResolvedValue(undefined);
    mocks.redeem.mockResolvedValue({ outcome: 'approved', entryId: 'entry-1' });
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
  });

  it('rejects a missing token before reading identity or redeeming', async () => {
    expect(renderToStaticMarkup(await page())).toContain('Invite link missing');
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.opened).not.toHaveBeenCalled();
    expect(mocks.redeemed).not.toHaveBeenCalled();
    expect(mocks.redeem).not.toHaveBeenCalled();
  });

  it('sends anonymous recipients to sign-in with the invitation continuation', async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    await expect(page('secure-token')).rejects.toThrow(
      'REDIRECT:/signin?redirect_url='
    );
    expect(mocks.opened).toHaveBeenCalledExactlyOnceWith('secure-token');
    expect(mocks.auth).toHaveBeenCalledWith({ session: 'fresh' });
    expect(mocks.redeem).not.toHaveBeenCalled();
    expect(mocks.redeemed).not.toHaveBeenCalled();
  });

  it.each([false, undefined])(
    'refuses an email without trusted verification %s',
    async emailVerified => {
      mocks.currentUser.mockResolvedValue({
        emailVerified,
        emailAddresses: [
          {
            emailAddress: 'invited@example.com',
            verification: { status: 'verified' },
          },
        ],
      });
      expect(renderToStaticMarkup(await page('secure-token'))).toContain(
        'Verify your email'
      );
      expect(mocks.redeem).not.toHaveBeenCalled();
      expect(mocks.rateLimit).not.toHaveBeenCalled();
      expect(mocks.redeemed).not.toHaveBeenCalled();
    }
  );

  it('reads a fresh verified identity and redeems its single Better Auth email', async () => {
    await expect(page('secure-token')).rejects.toThrow(
      'REDIRECT:/start?fresh_signup=true'
    );
    expect(mocks.opened).toHaveBeenCalledExactlyOnceWith('secure-token');
    expect(mocks.redeemed).toHaveBeenCalledExactlyOnceWith({
      entryId: 'entry-1',
      appUserId: 'app-user-id',
    });
    expect(mocks.auth).toHaveBeenCalledWith({ session: 'fresh' });
    expect(mocks.currentUser).toHaveBeenCalledWith({ session: 'fresh' });
    expect(mocks.redeem).toHaveBeenCalledWith({
      token: 'secure-token',
      clerkUserId: 'app-user-id',
      verifiedEmails: ['invited@example.com'],
    });
  });

  it('renders recoverable rate-limit guidance before redemption', async () => {
    mocks.rateLimit.mockRejectedValue(
      new Error('[RATE_LIMITED] Try again later.')
    );
    const html = renderToStaticMarkup(await page('secure-token'));
    expect(html).toContain('Too many attempts');
    expect(html).toContain('Try again later.');
    expect(mocks.redeem).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid', 'Invite link invalid'],
    ['expired', 'Invite expired'],
    ['email_mismatch', 'Use the invited email'],
  ])('shows %s redemption without granting access', async (outcome, title) => {
    mocks.redeem.mockResolvedValue({ outcome });
    expect(renderToStaticMarkup(await page('secure-token'))).toContain(title);
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.redeemed).not.toHaveBeenCalled();
  });
});
