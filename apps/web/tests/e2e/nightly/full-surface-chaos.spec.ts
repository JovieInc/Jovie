import { expect, test } from '@playwright/test';
import {
  ensureSignedInUser,
  getAdminCredentials,
  hasAdminCredentials,
  hasClerkCredentials,
  setTestAuthBypassSession,
  signInUser,
} from '../../helpers/clerk-auth';
import type { DashboardRouteDescriptor } from '../utils/dashboard-route-matrix';
import { DASHBOARD_ROUTE_MATRIX } from '../utils/dashboard-route-matrix';
import {
  assertNoCriticalErrors,
  setupPageMonitoring,
  smokeNavigateWithRetry,
  waitForHydration,
} from '../utils/smoke-test-utils';

const SAFE_CLICK_LIMIT = 10;
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const ROUTES: readonly DashboardRouteDescriptor[] = [
  ...DASHBOARD_ROUTE_MATRIX.dashboard.full,
  ...DASHBOARD_ROUTE_MATRIX.settings.full,
  ...DASHBOARD_ROUTE_MATRIX.alias.full,
  ...DASHBOARD_ROUTE_MATRIX.admin.full,
].filter(
  (route, index, routes) =>
    routes.findIndex(candidate => candidate.path === route.path) === index
);

function usesBypassAuth() {
  return process.env.E2E_USE_TEST_AUTH_BYPASS === '1';
}

function hasAuthForRoute(route: DashboardRouteDescriptor) {
  if (route.authRole === 'anonymous') {
    return true;
  }

  if (route.authRole === 'admin') {
    return usesBypassAuth() ? hasClerkCredentials() : hasAdminCredentials();
  }

  return hasClerkCredentials();
}

async function stubPassiveTracking(page: import('@playwright/test').Page) {
  await page.route('**/api/profile/view', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', route =>
    route.fulfill({ status: 200, body: '{}' })
  );
}

async function authenticateForRoute(
  page: import('@playwright/test').Page,
  route: DashboardRouteDescriptor
) {
  if (route.authRole === 'anonymous') {
    return;
  }

  if (route.authRole === 'admin') {
    if (usesBypassAuth()) {
      await setTestAuthBypassSession(page, 'admin');
      return;
    }

    await signInUser(page, getAdminCredentials());
    return;
  }

  if (usesBypassAuth()) {
    await setTestAuthBypassSession(page, 'creator-ready');
    return;
  }

  await ensureSignedInUser(page);
}

async function resolveRoutePath(
  page: import('@playwright/test').Page,
  route: DashboardRouteDescriptor
) {
  if (route.kind === 'dynamic' && route.resolver) {
    return await route.resolver(page);
  }

  return route.path;
}

function normalizeComparableUrl(urlValue: string) {
  const url = new URL(urlValue, BASE_URL);
  const normalizedPath = url.pathname.replace(/\/$/, '') || '/';
  return `${normalizedPath}${url.search}`;
}

function matchesAcceptedDestination(
  currentUrl: string,
  route: DashboardRouteDescriptor
) {
  return (
    route.acceptedDestinations?.some(destination => {
      return (
        normalizeComparableUrl(currentUrl) ===
        normalizeComparableUrl(destination)
      );
    }) ?? false
  );
}

async function waitForRouteContent(
  page: import('@playwright/test').Page,
  route: DashboardRouteDescriptor
) {
  const selectors = [
    route.contentSelector,
    route.contentFallbackSelector,
    'main',
  ].filter((value): value is string => Boolean(value));

  for (const selector of selectors) {
    const isVisible = await page
      .locator(selector)
      .first()
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (isVisible) {
      return;
    }
  }

  await expect(page.locator('main').first()).toBeVisible();
}

async function findSafeClickTargets(page: import('@playwright/test').Page) {
  return await page.evaluate(limit => {
    const blockedTokens = [
      'delete',
      'remove',
      'disconnect',
      'cancel',
      'ban',
      'unban',
      'sign out',
      'log out',
      'skip',
      'dismiss',
      'block',
      'archive',
    ];

    const selectors = [
      'button:not([disabled])',
      '[role="button"]:not([disabled])',
      '[role="tab"]',
      '[role="switch"]',
      '[role="checkbox"]',
      '[data-testid]',
      'a[href^="/"]',
    ];

    const seen = new Set<string>();
    const results: string[] = [];

    for (const selector of selectors) {
      for (const node of Array.from(document.querySelectorAll(selector))) {
        const element = node as HTMLElement;
        const rect = element.getBoundingClientRect();
        if (
          rect.width === 0 ||
          rect.height === 0 ||
          window.getComputedStyle(element).visibility === 'hidden' ||
          window.getComputedStyle(element).display === 'none'
        ) {
          continue;
        }

        const label = (
          element.getAttribute('aria-label') ||
          element.textContent ||
          element.getAttribute('data-testid') ||
          ''
        ).toLowerCase();
        if (!label || blockedTokens.some(token => label.includes(token))) {
          continue;
        }

        const testId = element.getAttribute('data-testid');
        const ariaLabel = element.getAttribute('aria-label');
        const id = element.getAttribute('id');
        const href = element.getAttribute('href');

        const stableSelector =
          (testId && `[data-testid="${testId}"]`) ||
          (ariaLabel && `[aria-label="${ariaLabel}"]`) ||
          (id && `#${id}`) ||
          (href && `a[href="${href}"]`) ||
          null;

        if (!stableSelector || seen.has(stableSelector)) {
          continue;
        }

        seen.add(stableSelector);
        results.push(stableSelector);
        if (results.length >= limit) {
          return results;
        }
      }
    }

    return results;
  }, SAFE_CLICK_LIMIT);
}

async function sweepSafeClicks(page: import('@playwright/test').Page) {
  const selectors = await findSafeClickTargets(page);

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const isVisible = await locator.isVisible().catch(() => false);
    if (!isVisible) {
      continue;
    }

    await locator.scrollIntoViewIfNeeded().catch(() => {});
    await locator.click({ timeout: 2_000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  }
}

test.describe('Full Surface Chaos @full-surface-chaos', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const route of ROUTES) {
    test(`${route.surface}: ${route.name}`, async ({ page }, testInfo) => {
      test.skip(
        !hasAuthForRoute(route),
        `Auth prerequisites not configured for ${route.name}`
      );

      await stubPassiveTracking(page);
      const { getContext, cleanup } = setupPageMonitoring(page);

      try {
        await authenticateForRoute(page, route);
        const resolvedPath = await resolveRoutePath(page, route);

        await smokeNavigateWithRetry(page, resolvedPath, {
          timeout: 120_000,
          retries: 2,
        });

        await waitForHydration(page);

        if (route.kind === 'redirect' && route.acceptedDestinations?.length) {
          await expect
            .poll(() => matchesAcceptedDestination(page.url(), route), {
              timeout: 15_000,
            })
            .toBe(true);
        } else {
          await waitForRouteContent(page, route);
          await sweepSafeClicks(page);
        }

        await waitForHydration(page);
        await assertNoCriticalErrors(getContext(), testInfo);
      } finally {
        cleanup();
      }
    });
  }
});
