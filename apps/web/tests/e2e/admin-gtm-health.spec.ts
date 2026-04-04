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
  test('admin leads renders GTM insights and pipeline controls without runtime errors', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await expectAdminPage(page, getAdminSurfaceById('growth-leads').path);
      await expect(page.getByTestId('admin-growth-view-leads')).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await expect(
        page.getByRole('heading', { name: 'Lead pipeline' })
      ).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await expect(page.getByText('Unified URL intake')).toBeVisible({
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

  test('admin outreach email queue renders without GTM metric query failures', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await expectAdminPage(
        page,
        getAdminSurfaceById('growth-outreach-email').path
      );
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
