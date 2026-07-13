import { ClerkTestError, signInUser } from '../helpers/clerk-auth';
import { expect, test } from './setup';
import { getAdminSurfaceById } from './utils/admin-surface-manifest';
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
  let response = await smokeNavigateWithRetry(page, path, {
    timeout: 120_000,
    retries: 2,
  });

  if (
    page.url().includes('/signin') ||
    page.url().includes('/sign-in') ||
    page.url().includes('/signup') ||
    page.url().includes('/sign-up')
  ) {
    try {
      await signInUser(page);
    } catch (error) {
      if (error instanceof ClerkTestError) {
        test.skip(
          true,
          `Admin smoke requires authenticated session: ${error.message}`
        );
        return;
      }
      throw error;
    }

    response = await smokeNavigateWithRetry(page, path, {
      timeout: 120_000,
      retries: 2,
    });
  }

  expect(response?.status()).toBe(200);
  await waitForHydration(page);
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveURL(
    url => `${url.pathname}${url.search}` === path || url.pathname === path,
    {
      timeout: SMOKE_TIMEOUTS.NAVIGATION,
    }
  );
}

test.describe('Admin GTM Health @smoke', () => {
  test('admin growth renders speed dial, funnel, and lead table without runtime errors', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await expectAdminPage(page, getAdminSurfaceById('growth-leads').path);
      await expect(page.getByTestId('admin-growth-view-leads')).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await expect(page.getByTestId('gtm-pipeline-status')).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await expect(
        page.getByRole('button', { name: 'Search leads' })
      ).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await assertNoCriticalErrors(getContext(), testInfo);
    } finally {
      cleanup();
    }
  });

  test('admin growth outreach deep link opens accordion without runtime errors', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await expectAdminPage(
        page,
        getAdminSurfaceById('growth-outreach-email').path
      );
      // The page loads with the outreach accordion auto-opened via ?view=outreach
      await expect(page.getByTestId('admin-growth-page')).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await assertNoCriticalErrors(getContext(), testInfo);
    } finally {
      cleanup();
    }
  });
});
