import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

describe('legacy settings referral redirect', () => {
  it(`redirects to ${APP_ROUTES.REFERRALS} in next.config.js`, async () => {
    const nextConfig = require('../../../next.config.js');
    const redirects = await nextConfig.redirects();
    const legacyRedirect = redirects.find(
      (redirect: { source: string }) =>
        redirect.source === '/app/settings/referral'
    );

    expect(legacyRedirect).toMatchObject({
      source: '/app/settings/referral',
      destination: APP_ROUTES.REFERRALS,
      permanent: false,
    });
  });
});
