import { ClerkTestError } from '../helpers/auth';
import { expect, test } from './setup';
import { getAdminSurfaceById } from './utils/admin-surface-manifest';
import { hasAdminCredentials, signInAsAdmin } from './utils/admin-test-utils';
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
      await signInAsAdmin(page);
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
  test.beforeEach(async ({ page }) => {
    // The shared storage state carries the lane's creator persona; admin
    // surfaces redirect non-admins to /app, so establish the admin session
    // before the first navigation (JOV-4326).
    test.skip(!hasAdminCredentials(), 'Admin auth not available');
    await signInAsAdmin(page);
  });

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
      // The surface path carries ?q=<FILTERED_SEARCH>, so HeaderSearchAction
      // mounts expanded (type="search" input). getByLabel matches the
      // 'Search leads' control in either the collapsed button or open field
      // state, whichever the mounted contract renders.
      await expect(page.getByLabel('Search leads')).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await assertNoCriticalErrors(getContext(), testInfo);
    } finally {
      cleanup();
    }
  });

  for (const [surfaceId, accordionName] of [
    ['growth-outreach', 'Outreach & Campaigns'],
    ['growth-campaigns', 'Outreach & Campaigns'],
    ['growth-ingest', 'Intake & Keywords'],
  ] as const) {
    test(`${surfaceId} deep link opens its operational accordion`, async ({
      page,
    }, testInfo) => {
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        await expectAdminPage(page, getAdminSurfaceById(surfaceId).path);
        const accordion = page.getByRole('button', {
          name: accordionName,
          exact: true,
        });
        await expect(accordion).toHaveAttribute('aria-expanded', 'true');
        // Refresh must preserve the selected operational context.
        await page.reload();
        await expect(accordion).toHaveAttribute('aria-expanded', 'true');
        await assertNoCriticalErrors(getContext(), testInfo);
      } finally {
        cleanup();
      }
    });
  }
});
