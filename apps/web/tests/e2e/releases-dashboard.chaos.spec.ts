import { expect, test } from '@playwright/test';
import { ensureSignedInUser, hasClerkCredentials } from '../helpers/clerk-auth';
import {
  assertNoCriticalErrors,
  setupPageMonitoring,
  smokeNavigateWithRetry,
  waitForHydration,
} from './utils/smoke-test-utils';

const RELEASES_ROUTE = '/app/dashboard/releases';
const SAFE_CLICK_LIMIT = 8;
const SIDEBAR_OPEN_TIMEOUT_MS = 30_000;

type ReleasesSurface = 'desktop' | 'mobile';

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

async function resolveReleasesSurface(
  page: import('@playwright/test').Page
): Promise<ReleasesSurface | null> {
  const mobileRows = page.locator('[data-testid^="mobile-release-row-"]');
  if (
    await mobileRows
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false)
  ) {
    return 'mobile';
  }

  const desktopRows = page.locator('tbody tr');
  if (
    await desktopRows
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false)
  ) {
    return 'desktop';
  }

  return null;
}

async function expectPopulatedRoute(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('releases-matrix')).toBeVisible();
  const surface = await resolveReleasesSurface(page);
  if (surface === 'mobile') {
    const rows = page.locator('[data-testid^="mobile-release-row-"]');
    expect(await rows.count()).toBeGreaterThan(0);
    return rows.first();
  }

  const getDesktopOpenButton = (scope: import('@playwright/test').Locator) =>
    scope.locator('[data-testid^="release-open-"]').first();

  const rows = page.locator('tbody tr');
  expect(await rows.count()).toBeGreaterThan(0);

  const taggedRow = page.getByTestId('release-row').first();
  if ((await taggedRow.count()) > 0) {
    const openButton = getDesktopOpenButton(taggedRow);
    if ((await openButton.count()) > 0) {
      return openButton;
    }
    const firstCell = taggedRow.locator('td').first();
    if ((await firstCell.count()) > 0) {
      return firstCell;
    }
    return taggedRow;
  }

  const firstRow = rows.first();
  const openButton = getDesktopOpenButton(firstRow);
  if ((await openButton.count()) > 0) {
    return openButton;
  }

  const firstCell = firstRow.locator('td').first();
  if ((await firstCell.count()) > 0) {
    return firstCell;
  }

  return firstRow;
}

async function waitForReleaseSidebar(page: import('@playwright/test').Page) {
  await expect(
    page
      .locator(
        '[data-testid="drawer-loading-skeleton"], [data-testid="release-sidebar"]'
      )
      .first()
  ).toBeVisible({ timeout: SIDEBAR_OPEN_TIMEOUT_MS });

  const sidebar = page.getByTestId('release-sidebar');
  await expect(sidebar).toBeVisible({ timeout: SIDEBAR_OPEN_TIMEOUT_MS });
  return sidebar;
}

function collectSameOriginApiFailures(
  pageUrl: string,
  responses: ReadonlyArray<{ url: string; status: number }>
) {
  const host = new URL(pageUrl).hostname;
  return responses.filter(response => {
    if (response.status === 401 || response.status === 403) {
      return false;
    }

    try {
      const url = new URL(response.url);
      return (
        url.hostname === host &&
        (url.pathname.startsWith('/api/') || url.pathname.startsWith('/trpc/'))
      );
    } catch {
      return false;
    }
  });
}

async function sweepSafeClicks(page: import('@playwright/test').Page) {
  const selectors = await page.evaluate(limit => {
    const blocked = [
      'delete',
      'remove',
      'sign out',
      'log out',
      'open',
      'export',
      'share',
      'view profile',
    ];
    const nodes = Array.from(
      document.querySelectorAll(
        '[data-testid="releases-matrix"] button, [data-testid="release-sidebar"] button'
      )
    );

    return nodes
      .map(node => {
        const element = node as HTMLElement;
        const label =
          element.getAttribute('aria-label')?.trim() ||
          element.textContent?.trim() ||
          '';
        if (
          !label ||
          blocked.some(token => label.toLowerCase().includes(token))
        ) {
          return null;
        }

        if (element.dataset.testid) {
          return `[data-testid="${element.dataset.testid}"]`;
        }

        if (element.getAttribute('aria-label')) {
          return `[aria-label="${element.getAttribute('aria-label')}"]`;
        }

        return null;
      })
      .filter((selector): selector is string => Boolean(selector))
      .slice(0, limit);
  }, SAFE_CLICK_LIMIT);

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (!(await locator.isVisible().catch(() => false))) {
      continue;
    }
    await locator.click({ timeout: 2_000 }).catch(() => {});
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
  }
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Releases Dashboard Chaos', () => {
  test.setTimeout(300_000);

  test.beforeEach(async ({ page }) => {
    if (!hasClerkCredentials()) {
      test.skip(
        true,
        'Authenticated releases chaos requires Clerk credentials'
      );
      return;
    }
    await stubPassiveTracking(page);
    await ensureSignedInUser(page);
  });

  test('survives scripted release abuse without runtime or API failures', async ({
    page,
  }, testInfo) => {
    const { getContext, cleanup } = setupPageMonitoring(page);

    try {
      await smokeNavigateWithRetry(page, RELEASES_ROUTE, {
        timeout: 90_000,
        retries: 2,
      });
      await waitForHydration(page);

      const firstRow = await expectPopulatedRoute(page);
      await firstRow.click();

      const sidebar = await waitForReleaseSidebar(page);
      await sidebar.getByTestId('drawer-tab-dsps').click();
      await sidebar.getByRole('button', { name: 'Tasks' }).click();
      await sidebar.focus();
      await sidebar.press('Escape');
      await expect(sidebar).not.toBeVisible();

      await firstRow.click();
      await waitForReleaseSidebar(page);
      await expect(sidebar.getByTitle('Copy smart link')).toBeVisible();

      await page.goto('/app', { waitUntil: 'domcontentloaded' });
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await waitForHydration(page);
      await expectPopulatedRoute(page);

      const viewport = page.viewportSize();
      if (viewport && viewport.width >= 1024) {
        await page.setViewportSize({ width: 540, height: viewport.height });
        await waitForHydration(page);
        await page.setViewportSize(viewport);
        await waitForHydration(page);
      }

      await sweepSafeClicks(page);

      const context = getContext();
      const apiFailures = collectSameOriginApiFailures(
        page.url(),
        context.networkDiagnostics.failedResponses
      );
      await assertNoCriticalErrors(context, testInfo);
      expect(apiFailures, JSON.stringify(apiFailures, null, 2)).toEqual([]);
      await expect(
        page.locator(
          '[data-testid="error-page"], [data-testid="error-boundary"], [data-testid="dashboard-error"]'
        )
      ).toHaveCount(0);
    } finally {
      cleanup();
    }
  });
});
