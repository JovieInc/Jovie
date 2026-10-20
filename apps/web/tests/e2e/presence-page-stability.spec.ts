/**
 * E2E stability spec: the Profiles workspace that replaced the DSP presence
 * page must not flash a loading skeleton during a background query
 * invalidation (async data churn).
 *
 * Regression guard for JOV-2162, retargeted after JOV-7161 / #20953. The
 * legacy /app/dashboard/presence route redirects to /app/presence, which
 * renders profiles-workspace. The old dsp-presence-content-panel is no
 * longer mounted on this route. The loading skeleton
 * (data-testid="presence-loading-skeleton") should never appear once the
 * workspace is visible.
 *
 * How it works:
 * 1. Auth via the dev bypass to a creator-ready session on the legacy route.
 * 2. Follow the redirect to /app/presence and wait for profiles-workspace.
 * 3. Call window.__JOVIE_E2E_INVALIDATE_QUERIES__(['dsp-enrichment']) to force
 *    a background refetch.
 * 4. assertDomStable confirms the skeleton NEVER appears for 2 seconds and
 *    the workspace remains visible.
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

  // Auth and follow the legacy presence route to the Profiles workspace.
  await page.goto(BYPASS_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(url => url.pathname === '/app/presence', {
    timeout: 60_000,
  });

  await expect(page.locator('[data-testid="profiles-workspace"]')).toBeVisible({
    timeout: 30_000,
  });

  // Trigger a background invalidation and assert no skeleton appears
  await assertDomStable(page, {
    selector: '[data-testid="profiles-workspace"]',
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
