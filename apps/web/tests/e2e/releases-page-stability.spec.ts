/**
 * E2E stability spec: releases page must not flash a loading skeleton
 * during a background query invalidation (async data churn).
 *
 * Regression guard for JOV-2151 / JOV-2162. The unit invariant in
 * ReleasesPageClient.test.tsx pins the `data === undefined` skeleton gate.
 * This spec provides an additional Playwright-layer guard that the DOM
 * remains stable when TanStack Query invalidates the releases cache.
 *
 * How it works:
 * 1. Auth via the dev bypass so we get a fully-loaded creator-ready session.
 * 2. Wait for the releases view to be visible (no skeleton).
 * 3. Call window.__JOVIE_E2E_INVALIDATE_QUERIES__(['releases']) to force a
 *    background refetch — the same event that previously caused flicker.
 * 4. assertDomStable confirms the skeleton NEVER appears for 2 seconds.
 *
 * Run:
 *   doppler run -- pnpm --filter web exec playwright test releases-page-stability --project=chromium
 *
 * @stability @smoke
 */

import { expect, test } from '@playwright/test';
import { assertDomStable } from '../helpers/dom-stability';

const BYPASS_URL =
  '/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/releases';

test.use({ storageState: { cookies: [], origins: [] } });

test('releases page stays stable during background query invalidation', async ({
  page,
}) => {
  test.setTimeout(120_000);

  const consoleErrors: string[] = [];
  page.on('pageerror', err => consoleErrors.push(String(err)));

  // Auth and navigate to releases
  await page.goto(BYPASS_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/app\/dashboard\/releases/, { timeout: 60_000 });

  // Wait for the releases view to be fully rendered (no skeleton).
  await expect(page.locator('[data-testid="releases-loading"]')).toHaveCount(
    0,
    {
      timeout: 30_000,
    }
  );

  await expect(page.getByTestId('releases-matrix')).toBeVisible({
    timeout: 15_000,
  });

  // Trigger a background invalidation via the E2E hook and assert no skeleton appears
  await assertDomStable(page, {
    absentSelector: '[data-testid="releases-loading"]',
    durationMs: 2000,
    while: async () => {
      await page.evaluate(() => {
        window.__JOVIE_E2E_INVALIDATE_QUERIES__?.(['releases']);
      });
    },
  });

  // No uncaught JS errors during the stability window
  const ignorable = [/clerk|handshake|dev-browser/i, /sentry/i, /favicon/i];
  const relevant = consoleErrors.filter(e => !ignorable.some(rx => rx.test(e)));
  expect(
    relevant,
    `Unexpected console errors during stability window: ${relevant.join('\n')}`
  ).toEqual([]);
});
