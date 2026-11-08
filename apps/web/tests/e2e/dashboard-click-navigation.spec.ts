/**
 * Signed-in sidebar click navigation for the dashboard shell.
 *
 * Route specs open each dashboard page with `page.goto`, which is a full
 * document load and never runs the App Router's client-side transition. This
 * spec clicks the shell's own sidebar links, as a creator and as an admin,
 * and fails when a click leaves the route unchanged or falls back to a hard
 * reload.
 *
 * Run:
 *   E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/dashboard-click-navigation.spec.ts --project=chromium
 */

import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/auth';
import { assertSidebarClickNavigation } from './utils/dashboard-click-navigation';

test.use({ storageState: { cookies: [], origins: [] } });
// This spec is a merge gate, so it fails rather than skips when the
// test-auth bypass is off: a gate that quietly skips proves nothing.
test.beforeAll(() => {
  expect(
    process.env.E2E_USE_TEST_AUTH_BYPASS,
    'dashboard-click-navigation needs E2E_USE_TEST_AUTH_BYPASS=1'
  ).toBe('1');
});

for (const persona of ['creator-ready', 'admin'] as const) {
  test(`sidebar clicks move between dashboard pages (${persona})`, async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    const origin = new URL(baseURL ?? 'http://localhost:3100').origin;
    await setTestAuthBypassSession(page, persona);
    await page.goto(APP_ROUTES.DASHBOARD, { waitUntil: 'domcontentloaded' });
    await assertSidebarClickNavigation(page, origin);
  });
}
