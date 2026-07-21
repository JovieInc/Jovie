/**
 * E2E smoke: /exp/page-builder renders the composed landing page and the
 * DESIGN_V1-flagged studio modes.
 *
 * /exp/* is production-blocked (lib/security/production-blocked-routes.ts),
 * so this spec only runs against dev/preview targets and skips on
 * production. DESIGN_V1 is forced on via the override cookie + localStorage,
 * the same mechanism as shell-chat-v1-flag-off.spec.ts.
 *
 * Run:
 *   doppler run --project jovie-web --config dev -- pnpm --filter @jovie/web exec playwright test tests/e2e/page-builder.smoke.spec.ts --project=chromium
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import { APP_FLAG_OVERRIDE_KEYS } from '@/lib/flags/contracts';
import {
  APP_FLAG_OVERRIDES_COOKIE,
  FF_OVERRIDES_KEY,
} from '@/lib/flags/overrides';
import { isProductionTarget } from '../helpers/auth';

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  if (isProductionTarget()) {
    test.skip(true, '/exp/* routes are blocked on production targets');
  }

  const overrides = JSON.stringify({
    [APP_FLAG_OVERRIDE_KEYS.DESIGN_V1]: true,
  });

  await page.addInitScript(
    ({ cookieName, key, value }) => {
      localStorage.setItem(key, value);
      document.cookie = `${cookieName}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
    },
    {
      cookieName: APP_FLAG_OVERRIDES_COOKIE,
      key: FF_OVERRIDES_KEY,
      value: overrides,
    }
  );
});

test('page builder composes the default landing page from registry sections', async ({
  page,
}) => {
  await page.goto('/exp/page-builder', { waitUntil: 'domcontentloaded' });

  await expect(
    page.locator('[data-body-section="marketing-hero"]')
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('[data-body-section="faq-section-default"]')
  ).toBeVisible();
});

test('sections mode renders the design studio workspace when DESIGN_V1 is on', async ({
  page,
}) => {
  await page.goto('/exp/page-builder?mode=sections', {
    waitUntil: 'domcontentloaded',
  });

  await expect(page.getByTestId('design-studio-sections')).toBeVisible({
    timeout: 30_000,
  });
});
