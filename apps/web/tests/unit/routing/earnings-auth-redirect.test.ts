import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

type RedirectRule = {
  readonly source: string;
  readonly destination: string;
};

describe('earnings auth redirects', () => {
  it('keeps earnings deep links out of static redirects', async () => {
    const nextConfigModule = await import('../../../next.config.js');
    const nextConfig = nextConfigModule.default ?? nextConfigModule;
    const redirects = (await nextConfig.redirects()) as RedirectRule[];

    expect(
      redirects.find(redirect => redirect.source === APP_ROUTES.EARNINGS)
    ).toBeUndefined();
    expect(
      redirects.find(
        redirect => redirect.source === APP_ROUTES.DASHBOARD_EARNINGS
      )
    ).toBeUndefined();
  });
});
