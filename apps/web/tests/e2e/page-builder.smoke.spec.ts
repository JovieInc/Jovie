/**
 * E2E smoke: /exp/page-builder fails closed for unauthenticated visitors.
 *
 * The shared /exp layout performs the role check before rendering prototype
 * children. Production retains its proxy defence-in-depth; development and
 * preview exercise the layout gate directly.
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web exec playwright test tests/e2e/page-builder.smoke.spec.ts --project=chromium
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import { isProductionTarget } from '../helpers/auth';
import { setTestAuthBypassSession } from '../helpers/clerk-auth';
import { hasAdminCredentials, signInAsAdmin } from './utils/admin-test-utils';
import { SMOKE_TIMEOUTS } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(() => {
  if (isProductionTarget()) {
    test.skip(true, '/exp/* retains a production proxy defence-in-depth');
  }
});

test('page builder returns not-found without exposing prototype data', async ({
  page,
}) => {
  await page.goto('/exp/page-builder', {
    waitUntil: 'domcontentloaded',
  });

  // Streamed App Router notFound() responses can retain HTTP 200. Prove the
  // fail-closed gate by its sentinel, original path, and absent prototype data.
  expect(new URL(page.url()).pathname).toBe('/exp/page-builder');
  await expect(page.getByTestId('not-found')).toBeVisible();
  await expect(
    page.locator('[data-body-section="marketing-hero"]')
  ).toHaveCount(0);
  await expect(page.getByTestId('design-studio-sections')).toHaveCount(0);
});

test('page builder returns not-found for authenticated non-admins', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_USE_TEST_AUTH_BYPASS !== '1',
    'Non-admin auth fixture not available'
  );

  await setTestAuthBypassSession(page, 'creator-ready');
  await page.goto('/exp/page-builder', {
    waitUntil: 'domcontentloaded',
  });

  expect(new URL(page.url()).pathname).toBe('/exp/page-builder');
  await expect(page.getByTestId('not-found')).toBeVisible();
  await expect(
    page.locator('[data-body-section="marketing-hero"]')
  ).toHaveCount(0);
  await expect(page.getByTestId('design-studio-sections')).toHaveCount(0);
});

test('page builder renders preview content for authenticated admins', async ({
  page,
}) => {
  test.setTimeout(180_000);
  test.skip(!hasAdminCredentials(), 'Admin auth not available');

  await signInAsAdmin(page);
  const response = await page.goto('/exp/page-builder', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(SMOKE_TIMEOUTS.HYDRATION_SETTLE);

  expect(response?.ok()).toBe(true);
  await expect(
    page.locator('[data-body-section="marketing-hero"]')
  ).toBeVisible({ timeout: 30_000 });
});
