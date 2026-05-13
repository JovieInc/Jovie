/**
 * E2E stability spec: presence (DSP) page must not flash a loading skeleton
 * during a background query invalidation (async data churn).
 *
 * Regression guard for JOV-2162. Analogous to releases-page-stability.spec.ts.
 * The presence page's loading.tsx skeleton (data-testid="presence-loading-skeleton")
 * should never appear once the page is fully loaded — only on a true cold load
 * before any data is in cache.
 *
 * How it works:
 * 1. Auth via the dev bypass to a creator-ready session.
 * 2. Wait for the DSP presence content panel to be visible.
 * 3. Call window.__JOVIE_E2E_INVALIDATE_QUERIES__(['dsp-enrichment']) to force
 *    a background refetch.
 * 4. assertDomStable confirms the skeleton NEVER appears for 2 seconds and
 *    the content panel remains visible.
 *
 * Run:
 *   doppler run -- pnpm --filter web exec playwright test presence-page-stability --project=chromium
 *
 * @stability @smoke
 */

import { expect, test } from '@playwright/test';
import { assertDomStable } from '../helpers/dom-stability';

const BYPASS_URL =
  '/api/dev/test-auth/enter?persona=creator-ready&redirect=/app/dashboard/presence';

test.use({ storageState: { cookies: [], origins: [] } });

test('presence page stays stable during background query invalidation', async ({
  page,
}) => {
  test.setTimeout(120_000);

  const consoleErrors: string[] = [];
  page.on('pageerror', err => consoleErrors.push(String(err)));

  // Auth and navigate to presence page
  await page.goto(BYPASS_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/app\/dashboard\/presence/, { timeout: 60_000 });

  // Wait for the presence content panel to be visible (skeleton gone)
  await expect(
    page.locator('[data-testid="dsp-presence-content-panel"]')
  ).toBeVisible({ timeout: 30_000 });

  // Trigger a background invalidation and assert no skeleton appears
  await assertDomStable(page, {
    selector: '[data-testid="dsp-presence-content-panel"]',
    absentSelector: '[data-testid="presence-loading-skeleton"]',
    durationMs: 2000,
    while: async () => {
      await page.evaluate(() => {
        window.__JOVIE_E2E_INVALIDATE_QUERIES__?.(['dsp-enrichment']);
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
