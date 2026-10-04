import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const APP_USER_ID = '18d83231-ea6d-4423-907c-e7e3cd8d3f53';

const mocks = vi.hoisted(() => ({
  getCachedAuth: vi.fn(),
  getOrCreateReferralCode: vi.fn(),
}));

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mocks.getCachedAuth,
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: { NEXT_PUBLIC_APP_URL: 'https://jov.ie' },
}));

vi.mock('@/lib/referrals/service', () => ({
  getOrCreateReferralCode: mocks.getOrCreateReferralCode,
}));

describe('settings referral page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedAuth.mockResolvedValue({ userId: APP_USER_ID });
    mocks.getOrCreateReferralCode.mockResolvedValue({
      code: 'artist-code',
      isNew: false,
    });
  });

  it('serves the canonical page and redirects the legacy alias to it', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const redirects = await nextConfig.redirects();
    const settingsReferralRedirect = redirects.find(
      (redirect: { source: string }) =>
        redirect.source === '/app/settings/referral'
    );

    expect(settingsReferralRedirect).toBeUndefined();

    const referralsRedirect = redirects.find(
      (redirect: { source: string }) => redirect.source === '/app/referrals'
    );

    expect(referralsRedirect).toMatchObject({
      source: '/app/referrals',
      destination: APP_ROUTES.SETTINGS_REFERRAL,
      permanent: false,
    });
  });

  it('creates the referral code for the authenticated app user ID', async () => {
    const { default: SettingsReferralPage } = await import(
      '../../../app/app/(shell)/settings/referral/page'
    );

    await SettingsReferralPage();

    expect(mocks.getOrCreateReferralCode).toHaveBeenCalledWith(APP_USER_ID);
  });
});
