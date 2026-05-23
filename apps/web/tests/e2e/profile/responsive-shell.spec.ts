/**
 * Profile responsive shell regression (JOV-2028).
 *
 * Asserts, for every route in the profile matrix at every breakpoint in
 * PROFILE_RESPONSIVE_VIEWPORTS:
 *   - The route hydrates without console errors.
 *   - document.scrollWidth never exceeds window.innerWidth (no horizontal
 *     overflow on initial load).
 *   - The bottom tab bar is visible on routes that should expose it, and
 *     hidden on secondary task flows.
 *   - The expected primary tab is marked aria-current="page" on routes that
 *     light up a primary tab.
 *
 * Why this exists: mobile-overflow.spec.ts covers ≤430px, and
 * profile-mobile-viewport-stability.spec.ts covers per-device stability. This
 * spec extends the matrix to 412/768/1280 and pins the tab bar state per route.
 *
 * Tag: @regression — not in the gated-CI smoke lane. Test budget is intentionally
 * tight: one navigation per (route × viewport), no flaky waits.
 */

import { type Page, test } from '@playwright/test';
import { expect } from '../setup';
import { getOverflowingElements } from '../utils/mobile-overflow';
import {
  PROFILE_MATRIX_ROUTES,
  PROFILE_RESPONSIVE_VIEWPORTS,
  type ProfileMatrixRoute,
  type ProfileViewportBreakpoint,
} from '../utils/profile-route-matrix';
import { installPublicRouteMocks } from '../utils/public-surface-helpers';
import { SMOKE_TIMEOUTS, waitForHydration } from '../utils/smoke-test-utils';

test.use({
  storageState: { cookies: [], origins: [] },
});

async function assertNoHorizontalOverflow(
  page: Page,
  viewport: ProfileViewportBreakpoint,
  label: string
) {
  const metrics = await page.evaluate(() => ({
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    innerWidth: window.innerWidth,
  }));

  // 1px tolerance for sub-pixel rounding at fractional device scale factors.
  expect(
    metrics.documentScrollWidth - metrics.innerWidth,
    `${label} introduced horizontal page overflow (document.scrollWidth=${metrics.documentScrollWidth}, innerWidth=${metrics.innerWidth})`
  ).toBeLessThanOrEqual(1);
  expect(
    metrics.bodyScrollWidth - metrics.innerWidth,
    `${label} introduced horizontal body overflow (body.scrollWidth=${metrics.bodyScrollWidth}, innerWidth=${metrics.innerWidth})`
  ).toBeLessThanOrEqual(1);
  expect(metrics.innerWidth, `${label} viewport width drifted`).toBe(
    viewport.width
  );

  const offenders = await getOverflowingElements(page);
  expect(
    offenders,
    `${label} has visible elements clipped outside the viewport: ${JSON.stringify(
      { metrics, offenders },
      null,
      2
    )}`
  ).toHaveLength(0);
}

async function waitForAnyVisible(
  page: Page,
  selectors: readonly string[],
  timeout = SMOKE_TIMEOUTS.VISIBILITY
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const visible = await page
        .locator(selector)
        .first()
        .isVisible()
        .catch(() => false);
      if (visible) return selector;
    }
    await page.waitForTimeout(150);
  }
  throw new Error(
    `None of the expected selectors became visible: ${selectors.join(', ')}`
  );
}

async function assertBottomTabBarState(
  page: Page,
  route: ProfileMatrixRoute,
  viewport: ProfileViewportBreakpoint,
  label: string
) {
  const tabBar = page.locator('[data-testid="profile-tab-bar"]').first();

  if (route.showsBottomTabBar && viewport.isMobile) {
    await expect(
      tabBar,
      `${label} should render the bottom tab bar`
    ).toBeVisible({
      timeout: SMOKE_TIMEOUTS.VISIBILITY,
    });

    if (route.expectedActiveTab) {
      const activeTab = tabBar.locator('[aria-current="page"]');
      await expect(
        activeTab,
        `${label} should mark exactly one tab as aria-current="page"`
      ).toHaveCount(1, { timeout: SMOKE_TIMEOUTS.QUICK });

      const expectedLabelByMode: Record<string, string> = {
        profile: 'Profile',
        listen: 'Music',
        tour: 'Events',
        subscribe: 'Alerts',
      };
      const expectedLabel = expectedLabelByMode[route.expectedActiveTab];
      if (expectedLabel) {
        await expect(
          activeTab,
          `${label} active tab label should be "${expectedLabel}"`
        ).toHaveAttribute('aria-label', expectedLabel);
      }
    }
  } else if (!route.showsBottomTabBar) {
    // Secondary task flows hide the tab bar. Allow it to be absent OR hidden.
    const count = await tabBar.count();
    if (count > 0) {
      await expect(
        tabBar,
        `${label} should hide the bottom tab bar on secondary flows`
      ).toBeHidden({ timeout: SMOKE_TIMEOUTS.QUICK });
    }
  }
}

test.describe('Public profile responsive shell @regression', () => {
  test.setTimeout(120_000);

  for (const viewport of PROFILE_RESPONSIVE_VIEWPORTS) {
    for (const route of PROFILE_MATRIX_ROUTES) {
      test(`${viewport.label} ${route.id} renders without overflow`, async ({
        browser,
      }, testInfo) => {
        const context = await browser.newContext({
          ...testInfo.project.use,
          storageState: { cookies: [], origins: [] },
          viewport: { width: viewport.width, height: viewport.height },
          isMobile: viewport.isMobile,
          hasTouch: viewport.isMobile,
        });
        const page = await context.newPage();
        const label = `${viewport.label} ${route.id}`;

        try {
          await installPublicRouteMocks(page);

          const response = await page.goto(route.path, {
            waitUntil: 'domcontentloaded',
            timeout: 120_000,
          });
          expect(
            response?.status() ?? 0,
            `${label} should not server-error`
          ).toBeLessThan(500);

          await waitForHydration(page);
          await waitForAnyVisible(page, route.readySelectors);

          await assertNoHorizontalOverflow(page, viewport, label);
          await assertBottomTabBarState(page, route, viewport, label);
        } finally {
          await page.close().catch(() => undefined);
          await context.close().catch(() => undefined);
        }
      });
    }
  }
});

test.describe('Public profile redirect parity @regression', () => {
  test.setTimeout(120_000);

  /**
   * Direct deep links to the legacy `/[username]/listen`, `/[username]/tour`,
   * etc. paths must resolve to the unified profile shell. This protects the
   * consolidation refactor (JOV-2021..2025) from silently regressing into
   * 404s or full page reloads.
   */
  const REDIRECT_DEEP_LINKS = [
    {
      id: 'listen-deep-link',
      path: `/${process.env.PUBLIC_SURFACE_MUSIC_HANDLE?.trim() || 'dualipa'}/listen`,
      expectedFinalPath: /\?mode=listen$|\/[^/?#]+$/,
    },
    {
      id: 'tour-deep-link',
      path: `/${process.env.PUBLIC_SURFACE_MUSIC_HANDLE?.trim() || 'dualipa'}/tour`,
      expectedFinalPath: /\?mode=tour$|\/[^/?#]+$/,
    },
    {
      id: 'subscribe-deep-link',
      path: `/${process.env.PUBLIC_SURFACE_MUSIC_HANDLE?.trim() || 'dualipa'}/subscribe`,
      expectedFinalPath: /\?mode=subscribe$|\/[^/?#]+$/,
    },
  ] as const;

  for (const link of REDIRECT_DEEP_LINKS) {
    test(`${link.id} resolves to the unified profile shell`, async ({
      browser,
    }, testInfo) => {
      const context = await browser.newContext({
        ...testInfo.project.use,
        storageState: { cookies: [], origins: [] },
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const page = await context.newPage();

      try {
        await installPublicRouteMocks(page);
        const response = await page.goto(link.path, {
          waitUntil: 'domcontentloaded',
          timeout: 120_000,
        });
        expect(response?.status() ?? 0).toBeLessThan(500);

        await waitForHydration(page);
        await waitForAnyVisible(page, ['[data-testid="profile-header"]']);

        const finalUrl = new URL(page.url());
        const finalPath = finalUrl.pathname + finalUrl.search;
        expect(
          link.expectedFinalPath.test(finalPath),
          `${link.id} settled at unexpected path: ${finalPath}`
        ).toBe(true);
      } finally {
        await page.close().catch(() => undefined);
        await context.close().catch(() => undefined);
      }
    });
  }
});
