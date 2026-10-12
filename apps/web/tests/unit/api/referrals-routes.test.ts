import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const APP_USER_ID = '18d83231-ea6d-4423-907c-e7e3cd8d3f53';

const mocks = vi.hoisted(() => ({
  createReferral: vi.fn(),
  getCachedAuth: vi.fn(),
  getOrCreateReferralCode: vi.fn(),
  getReferralStats: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.getCachedAuth,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/referrals/service', () => ({
  createReferral: mocks.createReferral,
  getOrCreateReferralCode: mocks.getOrCreateReferralCode,
  getReferralStats: mocks.getReferralStats,
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('referral API auth identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedAuth.mockResolvedValue({ userId: APP_USER_ID });
    mocks.getOrCreateReferralCode.mockResolvedValue({
      code: 'artist-code',
      isNew: false,
    });
    mocks.getReferralStats.mockResolvedValue({
      referralCode: 'artist-code',
      totalReferrals: 0,
      activeReferrals: 0,
      pendingReferrals: 0,
      churnedReferrals: 0,
      totalEarningsCents: 0,
      pendingEarningsCents: 0,
      paidEarningsCents: 0,
    });
    mocks.createReferral.mockResolvedValue({ success: true });
  });

  it('loads a referral code with the authenticated app user ID', async () => {
    const { GET } = await import('@/app/api/referrals/code/route');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.getOrCreateReferralCode).toHaveBeenCalledWith(APP_USER_ID);
  });

  it('creates a custom referral code with the authenticated app user ID', async () => {
    const { POST } = await import('@/app/api/referrals/code/route');
    const request = new NextRequest('https://jov.ie/api/referrals/code', {
      method: 'POST',
      body: JSON.stringify({ customCode: 'artist-code' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.getOrCreateReferralCode).toHaveBeenCalledWith(
      APP_USER_ID,
      'artist-code'
    );
  });

  it('loads referral stats with the authenticated app user ID', async () => {
    const { GET } = await import('@/app/api/referrals/stats/route');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.getReferralStats).toHaveBeenCalledWith(APP_USER_ID);
  });

  it('applies a referral code with the authenticated app user ID', async () => {
    const { POST } = await import('@/app/api/referrals/apply/route');
    const request = new NextRequest('https://jov.ie/api/referrals/apply', {
      method: 'POST',
      body: JSON.stringify({ code: 'friend-code' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.createReferral).toHaveBeenCalledWith(
      APP_USER_ID,
      'friend-code'
    );
  });
});
