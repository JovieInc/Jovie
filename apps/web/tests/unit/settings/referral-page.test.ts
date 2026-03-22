import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing the page
const mockGetCachedAuth = vi.fn();
const mockGetInternalUserId = vi.fn();
const mockGetOrCreateReferralCode = vi.fn();
const mockGetReferralStats = vi.fn();
const mockRedirect = vi.fn();

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: () => mockGetCachedAuth(),
}));

vi.mock('@/lib/referrals/service', () => ({
  getInternalUserId: (id: string) => mockGetInternalUserId(id),
  getOrCreateReferralCode: (id: string) => mockGetOrCreateReferralCode(id),
  getReferralStats: (id: string) => mockGetReferralStats(id),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    // Next.js redirect throws to halt execution
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock('@/lib/referrals/config', () => ({
  DEFAULT_COMMISSION_DURATION_MONTHS: 12,
  DEFAULT_COMMISSION_RATE_BPS: 1000,
  formatCommissionRate: () => '10%',
}));

// Import after mocks
import SettingsReferralPage from '../../../app/app/(shell)/settings/referral/page';

describe('SettingsReferralPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to sign-in when no userId from auth', async () => {
    mockGetCachedAuth.mockResolvedValue({ userId: null });

    await expect(SettingsReferralPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining('/signin')
    );
    expect(mockGetInternalUserId).not.toHaveBeenCalled();
  });

  it('redirects to onboarding when internal user ID is null', async () => {
    mockGetCachedAuth.mockResolvedValue({
      userId: 'user_clerk123',
    });
    mockGetInternalUserId.mockResolvedValue(null);

    await expect(SettingsReferralPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockGetInternalUserId).toHaveBeenCalledWith('user_clerk123');
    expect(mockRedirect).toHaveBeenCalledWith('/onboarding');
  });

  it('passes internal UUID (not Clerk ID) to referral service functions', async () => {
    const internalUuid = '550e8400-e29b-41d4-a716-446655440000';
    mockGetCachedAuth.mockResolvedValue({
      userId: 'user_clerk123',
    });
    mockGetInternalUserId.mockResolvedValue(internalUuid);
    mockGetOrCreateReferralCode.mockResolvedValue({ code: 'abc123' });
    mockGetReferralStats.mockResolvedValue({
      activeReferrals: 0,
      totalReferrals: 0,
      totalEarningsCents: 0,
      pendingEarningsCents: 0,
      paidEarningsCents: 0,
    });

    // Server component returns JSX — just verify it doesn't throw
    await SettingsReferralPage();

    expect(mockGetInternalUserId).toHaveBeenCalledWith('user_clerk123');
    expect(mockGetOrCreateReferralCode).toHaveBeenCalledWith(internalUuid);
    expect(mockGetReferralStats).toHaveBeenCalledWith(internalUuid);
  });
});
