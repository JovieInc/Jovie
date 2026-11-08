/**
 * Signed-in shell route health.
 *
 * Opens every sidebar destination twice: once as a full document load (the
 * only way a hydration mismatch shows up) and once by clicking its sidebar
 * link (the App Router client transition). Each visit must reach its route,
 * render no route error boundary and log no unexpected console error or
 * uncaught exception. Expected noise is filtered by EXPECTED_ERROR_PATTERNS
 * in utils/smoke-test-utils.ts, which is the one place to add a narrow,
 * documented exception.
 *
 * Run:
 *   E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/shell-route-health.spec.ts --config=playwright.config.noauth.ts --project=chromium
 */

import { expect, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/auth';
import { setupPageMonitoring } from './utils/smoke-test-utils';

test.use({ storageState: { cookies: [], origins: [] } });

// This spec is a merge gate. A runner without the persona bypass must fail
// loudly instead of skipping, because a skipped gate reads as green.
test.beforeAll(() => {
  if (process.env.E2E_USE_TEST_AUTH_BYPASS !== '1') {
    throw new Error(
      'shell-route-health needs E2E_USE_TEST_AUTH_BYPASS=1 and a database'
    );
  }
});

const SIDEBAR_LINK = 'a[data-navigation-item-id][href^="/app"]';
const SHELL_FRAME = '[data-app-shell-frame="true"]';
const ROUTE_TIMEOUT_MS = 30_000;
const SETTLE_MS = 750;

type Monitor = ReturnType<typeof setupPageMonitoring>;

interface Snapshot {
  readonly console: number;
  readonly uncaught: number;
}

function snapshot(monitor: Monitor): Snapshot {
  const context = monitor.getContext();
  return {
    console: context.criticalErrors.length,
    uncaught: context.uncaughtExceptions.length,
  };
}

function newErrorsSince(monitor: Monitor, before: Snapshot): string[] {
  const context = monitor.getContext();
  return [
    ...context.criticalErrors.slice(before.console).map(e => `console: ${e}`),
    ...context.uncaughtExceptions
      .slice(before.uncaught)
      .map(e => `uncaught: ${e}`),
  ].map(e => e.slice(0, 400));
}

async function enterShell(page: Page) {
  await setTestAuthBypassSession(page, 'creator-ready');
  await page.goto(
    `/api/dev/test-auth/enter?persona=creator-ready&redirect=${encodeURIComponent(APP_ROUTES.DASHBOARD)}`,
    { waitUntil: 'domcontentloaded' }
  );
  await expect(page.locator(SHELL_FRAME)).toBeVisible({
    timeout: ROUTE_TIMEOUT_MS,
  });
}

async function sidebarDestinations(page: Page): Promise<string[]> {
  await expect(page.locator(SIDEBAR_LINK).first()).toBeVisible({
    timeout: ROUTE_TIMEOUT_MS,
  });
  const hrefs = await page
    .locator(SIDEBAR_LINK)
    .evaluateAll(nodes =>
      nodes
        .filter(node => (node as HTMLElement).offsetParent !== null)
        .map(node => node.getAttribute('href') ?? '')
    );
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const href of hrefs) {
    const path = new URL(href, 'http://shell.local').pathname;
    if (!path.startsWith('/app') || seen.has(path)) continue;
    seen.add(path);
    paths.push(href);
  }
  return paths;
}

async function routeProblems(page: Page, label: string): Promise<string[]> {
  const problems: string[] = [];
  const frameVisible = await page
    .locator(SHELL_FRAME)
    .isVisible()
    .catch(() => false);
  if (!frameVisible) problems.push(`${label}: shell frame not visible`);
  const boundaries = await page
    .getByRole('alert')
    .filter({ hasText: /something went wrong|app updated/i })
    .count();
  if (boundaries > 0) problems.push(`${label}: route error boundary rendered`);
  return problems;
}

test.describe('signed-in shell route health', () => {
  test('every sidebar destination loads and client-navigates cleanly', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const monitor = setupPageMonitoring(page);
    const problems: string[] = [];
    try {
      await enterShell(page);
      const destinations = await sidebarDestinations(page);
      expect(
        destinations.length,
        `Expected at least 3 sidebar destinations, saw ${JSON.stringify(destinations)}`
      ).toBeGreaterThanOrEqual(3);

      // Full document loads: server render plus hydration.
      for (const href of destinations) {
        const before = snapshot(monitor);
        const response = await page.goto(href, {
          waitUntil: 'domcontentloaded',
          timeout: ROUTE_TIMEOUT_MS,
        });
        const status = response?.status() ?? 0;
        if (status >= 500) problems.push(`load ${href}: HTTP ${status}`);
        await page
          .waitForLoadState('load', { timeout: ROUTE_TIMEOUT_MS })
          .catch(() => undefined);
        await page.waitForTimeout(SETTLE_MS);
        problems.push(...(await routeProblems(page, `load ${href}`)));
        for (const error of newErrorsSince(monitor, before)) {
          problems.push(`load ${href}: ${error}`);
        }
      }

      // Client transitions: click each sidebar link from the dashboard.
      await page.goto(APP_ROUTES.DASHBOARD, { waitUntil: 'domcontentloaded' });
      await expect(page.locator(SHELL_FRAME)).toBeVisible({
        timeout: ROUTE_TIMEOUT_MS,
      });
      for (const href of destinations) {
        const before = snapshot(monitor);
        const target = new URL(href, page.url()).pathname;
        const link = page.locator(`a[data-navigation-item-id][href="${href}"]`);
        const clicked = await link
          .first()
          .click({ timeout: 10_000 })
          .then(() => true)
          .catch(() => false);
        if (!clicked) {
          problems.push(`click ${href}: link not clickable`);
          continue;
        }
        const moved = await page
          .waitForURL(url => url.pathname.startsWith(target), {
            timeout: ROUTE_TIMEOUT_MS,
          })
          .then(() => true)
          .catch(() => false);
        if (!moved) {
          problems.push(
            `click ${href}: route did not change (still ${new URL(page.url()).pathname})`
          );
        }
        await expect(page.locator('[data-navigation-pending="true"]'))
          .toHaveCount(0, { timeout: ROUTE_TIMEOUT_MS })
          .catch(() => problems.push(`click ${href}: pending state stuck`));
        await page.waitForTimeout(SETTLE_MS);
        problems.push(...(await routeProblems(page, `click ${href}`)));
        for (const error of newErrorsSince(monitor, before)) {
          problems.push(`click ${href}: ${error}`);
        }
      }
    } finally {
      monitor.cleanup();
    }

    expect(problems, problems.join('\n')).toEqual([]);
  });
});
