import { APP_ROUTES } from '@/constants/routes';
import { expect, test } from './setup';
import { smokeNavigateWithRetry } from './utils/smoke-test-utils';

const useTestAuthBypass = process.env.E2E_USE_TEST_AUTH_BYPASS === '1';

test.describe
  .serial('Presence Page @presence', () => {
    test.skip(!useTestAuthBypass, 'Requires E2E_USE_TEST_AUTH_BYPASS=1');

    test('legacy presence route redirects to artist profile settings music tab', async ({
      page,
    }) => {
      await page.goto(
        `/api/dev/test-auth/enter?persona=admin&redirect=${encodeURIComponent(APP_ROUTES.PRESENCE)}`,
        { waitUntil: 'domcontentloaded', timeout: 120_000 }
      );
      await smokeNavigateWithRetry(page, APP_ROUTES.PRESENCE, {
        timeout: 120_000,
        retries: 2,
      });
      await page.waitForLoadState('domcontentloaded');
      await expect(page).toHaveURL(
        url =>
          url.pathname === APP_ROUTES.SETTINGS_ARTIST_PROFILE &&
          url.searchParams.get('tab') === 'music',
        { timeout: 60_000 }
      );
    });
  });
