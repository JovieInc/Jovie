import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

describe('legacy settings referral redirect', () => {
  it(`redirects to ${APP_ROUTES.SETTINGS_ACCOUNT} in next.config.js`, async () => {
    const nextConfig = await import('../../../next.config.js');
    const redirects = await nextConfig.redirects();
    const settingsReferralRedirect = redirects.find(
      (redirect: { source: string }) =>
        redirect.source === '/app/settings/referral'
    );

    expect(settingsReferralRedirect).toMatchObject({
      source: '/app/settings/referral',
      destination: APP_ROUTES.SETTINGS_ACCOUNT,
      permanent: false,
    });

    const referralsRedirect = redirects.find(
      (redirect: { source: string }) => redirect.source === '/app/referrals'
    );

    expect(referralsRedirect).toMatchObject({
      source: '/app/referrals',
      destination: APP_ROUTES.SETTINGS_ACCOUNT,
      permanent: false,
    });
  });
});
