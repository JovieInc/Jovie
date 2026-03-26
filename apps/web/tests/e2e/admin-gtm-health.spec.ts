import { APP_ROUTES } from '@/constants/routes';
import { expect, test } from './setup';
import {
  assertNoCriticalErrors,
  SMOKE_TIMEOUTS,
  setupPageMonitoring,
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

async function expectAdminPage(
  page: import('@playwright/test').Page,
  path: string
) {
  const response = await smokeNavigateWithRetry(page, path, {
    timeout: 120_000,
    retries: 2,
  });

  expect(response?.status()).toBe(200);
  await waitForHydration(page);
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveURL(url => url.pathname === path, {
    timeout: SMOKE_TIMEOUTS.NAVIGATION,
  });
}

test.describe('Admin GTM Health @smoke', () => {
  test('admin leads renders GTM insights and pipeline controls without runtime errors', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await expectAdminPage(page, APP_ROUTES.ADMIN_LEADS);
      await expect(page.getByText('GTM insights')).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await expect(page.getByText('Pipeline controls')).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await expect(
        page.getByText('Ramp recommendation', { exact: true })
      ).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await assertNoCriticalErrors(getContext(), testInfo);
    } finally {
      cleanup();
    }
  });

  test('admin outreach email queue renders without GTM metric query failures', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await expectAdminPage(page, APP_ROUTES.ADMIN_OUTREACH_EMAIL);
      await expect(page.getByText('Campaign emails')).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await expect(
        page.getByRole('heading', { name: 'Email Queue' })
      ).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await expect(
        page.getByRole('button', { name: 'Queue Next Batch' })
      ).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await assertNoCriticalErrors(getContext(), testInfo);
    } finally {
      cleanup();
    }
  });
});
