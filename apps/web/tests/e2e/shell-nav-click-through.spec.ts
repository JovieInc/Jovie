/**
 * Signed-in mobile shell navigation click-through.
 *
 * dashboard-click-navigation.spec.ts clicks the desktop sidebar. This spec
 * covers the phone layout: the tab bar and the More menu. Each tap must
 * change the URL without a document reload, clear the pending state and
 * render no route error boundary.
 *
 * Run:
 *   E2E_USE_TEST_AUTH_BYPASS=1 pnpm --filter @jovie/web exec playwright test tests/e2e/shell-nav-click-through.spec.ts --config=playwright.config.noauth.ts --project=chromium
 */

import { expect, type Locator, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../helpers/auth';

test.use({ storageState: { cookies: [], origins: [] } });

// This spec is a merge gate. A runner without the persona bypass must fail
// loudly instead of skipping, because a skipped gate reads as green.
test.beforeAll(() => {
  if (process.env.E2E_USE_TEST_AUTH_BYPASS !== '1') {
    throw new Error(
      'shell-nav-click-through needs E2E_USE_TEST_AUTH_BYPASS=1 and a database'
    );
  }
});

const DOCUMENT_MARKER = '__JOVIE_SHELL_NAV_DOCUMENT__';
const NAVIGATION_TIMEOUT_MS = 20_000;

interface Destination {
  readonly label: string;
  readonly href: string;
}

const TABS: readonly Destination[] = [
  { label: 'Identity', href: APP_ROUTES.PRESENCE },
  { label: 'Work', href: APP_ROUTES.LIBRARY },
  { label: 'Inbox', href: APP_ROUTES.DASHBOARD },
];

function urlPattern(href: string): RegExp {
  const escaped = href.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  return new RegExp(`^[^?#]*?${escaped}(?:[?#].*)?$`);
}

async function enterShell(page: Page) {
  await setTestAuthBypassSession(page, 'creator-ready');
  await page.goto(
    `/api/dev/test-auth/enter?persona=creator-ready&redirect=${encodeURIComponent(APP_ROUTES.DASHBOARD)}`,
    { waitUntil: 'domcontentloaded' }
  );
  await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible({
    timeout: 30_000,
  });
  // A full document load drops this marker; a client navigation keeps it.
  await page.evaluate(marker => {
    (window as unknown as Record<string, number>)[marker] = Date.now();
  }, DOCUMENT_MARKER);
}

async function expectClientNavigation(
  page: Page,
  link: Locator,
  destination: Destination
) {
  await link.click();
  await expect(page, `${destination.label} changes the URL`).toHaveURL(
    urlPattern(destination.href),
    { timeout: NAVIGATION_TIMEOUT_MS }
  );
  await expect(
    page.locator('[data-navigation-pending="true"]'),
    `${destination.label} settles its pending state`
  ).toHaveCount(0, { timeout: NAVIGATION_TIMEOUT_MS });
  await expect(page.locator('[data-app-shell-frame="true"]')).toBeVisible();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /something went wrong|app updated/i }),
    `${destination.label} renders without a route error`
  ).toHaveCount(0);
  const sameDocument = await page.evaluate(
    marker => typeof (window as unknown as Record<string, unknown>)[marker],
    DOCUMENT_MARKER
  );
  expect(sameDocument, `${destination.label} navigates without a reload`).toBe(
    'number'
  );
}

test.describe('mobile shell navigation click-through', () => {
  test('mobile tab links navigate between dashboard pages', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await enterShell(page);

    const tabs = page.getByRole('navigation', { name: 'Dashboard Tabs' });
    await expect(tabs).toBeVisible();

    for (const destination of TABS) {
      await expectClientNavigation(
        page,
        tabs.getByRole('link', { name: destination.label, exact: true }),
        destination
      );
    }

    await tabs.getByRole('button', { name: 'More options' }).click();
    const expanded = page.getByRole('navigation', {
      name: 'Expanded Navigation Menu',
    });
    await expect(expanded).toBeVisible();
    await expectClientNavigation(
      page,
      expanded.getByRole('link', { name: 'Settings', exact: true }),
      { label: 'Settings', href: APP_ROUTES.SETTINGS }
    );
  });
});
