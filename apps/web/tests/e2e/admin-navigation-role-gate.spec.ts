import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { waitForHydration } from './utils/smoke-test-utils';

test.describe('Admin navigation role gate', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('keeps tab navigation inside the admin workspace when MFA is stale', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    // Skip outside the explicit dev-auth E2E lane; this test needs the admin bypass persona.
    test.skip(
      process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
      'dev-auth bypass not enabled'
    );

    await page.goto(
      `/api/dev/test-auth/enter?persona=admin&redirect=${encodeURIComponent(APP_ROUTES.ADMIN_PEOPLE)}`
    );
    await expect(page).toHaveURL(/\/app\/admin\/people/);
    await waitForHydration(page, { timeout: 30_000 }).catch(() => {});
    await expect(page.getByTestId('admin-people-view-waitlist')).toBeVisible({
      timeout: 30_000,
    });

    const creatorsTab = page.getByRole('tab', { name: 'Creators' });
    await expect(creatorsTab).toBeVisible({ timeout: 30_000 });
    await creatorsTab.click({ noWaitAfter: true });
    await expect(page).toHaveURL(/\/app\/admin\/people\?view=creators/, {
      timeout: 60_000,
    });
    await expect(page).not.toHaveURL(/\/app\/chat/);
    await expect(page.getByTestId('admin-people-view-creators')).toBeVisible({
      timeout: 30_000,
    });
  });
});
