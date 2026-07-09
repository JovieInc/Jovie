import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCurrentUser = vi.hoisted(() => vi.fn());
const mockGetCachedAuth = vi.hoisted(() => vi.fn());
const mockHeaders = vi.hoisted(() => vi.fn());
const mockRedirect = vi.hoisted(() => vi.fn());
const mockEnforceOnboardingRateLimit = vi.hoisted(() => vi.fn());
const mockRedeemWaitlistInviteToken = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: mockCurrentUser,
}));

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

vi.mock('@/lib/onboarding/rate-limit', () => ({
  enforceOnboardingRateLimit: mockEnforceOnboardingRateLimit,
  getOnboardingRateLimitMessage: (error: unknown) => {
    if (!(error instanceof Error)) return null;
    const prefix = '[RATE_LIMITED] ';
    return error.message.startsWith(prefix)
      ? error.message.slice(prefix.length)
      : null;
  },
}));

vi.mock('@/lib/utils/ip-extraction', () => ({
  extractClientIP: vi.fn().mockReturnValue('127.0.0.1'),
}));

vi.mock('@/lib/waitlist/redeem', () => ({
  redeemWaitlistInviteToken: mockRedeemWaitlistInviteToken,
}));

import WaitlistInvitePage from '@/app/waitlist/invite/page';

describe('WaitlistInvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCachedAuth.mockResolvedValue({ userId: 'clerk_123' });
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: 'creator@example.com',
          verification: { status: 'verified' },
        },
      ],
    });
    mockHeaders.mockResolvedValue(new Headers());
    mockEnforceOnboardingRateLimit.mockResolvedValue(undefined);
    mockRedeemWaitlistInviteToken.mockResolvedValue({
      outcome: 'approved',
      entryId: 'entry-1',
      clerkId: 'clerk_123',
    });
  });

  it.skip('renders recoverable guidance when invite redemption is rate limited (BA invite path)', async () => {
    mockEnforceOnboardingRateLimit.mockRejectedValue(
      new Error(
        '[RATE_LIMITED] Too many onboarding attempts. Please try again in 1 hour.'
      )
    );

    const node = await WaitlistInvitePage({
      searchParams: Promise.resolve({ token: 'secure-token' }),
    });
    const html = renderToStaticMarkup(node);

    expect(html).toContain('Too many attempts');
    expect(html).toContain(
      'Too many onboarding attempts. Please try again in 1 hour.'
    );
    expect(mockRedeemWaitlistInviteToken).not.toHaveBeenCalled();
  });

  it.skip('passes every verified Clerk email to invite redemption (BA invite path)', async () => {
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [
        {
          emailAddress: 'primary@example.com',
          verification: { status: 'verified' },
        },
        {
          emailAddress: 'invited@example.com',
          verification: { status: 'verified' },
        },
        {
          emailAddress: 'unverified@example.com',
          verification: { status: 'unverified' },
        },
      ],
    });
    mockRedeemWaitlistInviteToken.mockResolvedValue({
      outcome: 'invalid',
    });

    await WaitlistInvitePage({
      searchParams: Promise.resolve({ token: 'secure-token' }),
    });

    expect(mockRedeemWaitlistInviteToken).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'secure-token',
        clerkUserId: 'clerk_123',
        verifiedEmails: ['primary@example.com', 'invited@example.com'],
      })
    );
  });
});
