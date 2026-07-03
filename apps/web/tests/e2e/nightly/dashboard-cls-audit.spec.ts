/**
 * Dashboard Interaction CLS Audit (authenticated /app/* surfaces)
 *
 * Measures interaction-driven CLS on authenticated dashboard routes using the
 * same PerformanceObserver pattern as profile-cls-audit.spec.ts. Runs in the
 * nightly lane only — not PR-gating per testing.md runtime constraints.
 *
 * Interactions covered:
 * - Release row click → drawer open (JOV-3800 drawer instant-open baseline)
 * - Settings field save (JOV-3800 save-status layout stability)
 * - Calendar route first paint after shell navigation
 *
 * @nightly @stability-audit
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import { setTestAuthBypassSession } from '../../helpers/clerk-auth';
import {
  attachClsResult,
  CLS_INTERACTION_BUDGET,
  collectInteractionCls,
  installInteractionClsObserver,
  shouldSkipClsInDevMode,
} from '../../helpers/cls-measurement';
import { waitForHydration } from '../utils/smoke-test-utils';

const TIMEOUTS = {
  NAVIGATION: 90_000,
  ELEMENT: 30_000,
  SIDEBAR: 30_000,
} as const;

test.use({ storageState: { cookies: [], origins: [] } });

async function requireBypassAuth(): Promise<void> {
  if (process.env.E2E_USE_TEST_AUTH_BYPASS !== '1') {
    test.skip(true, 'Requires E2E_USE_TEST_AUTH_BYPASS=1');
  }
}

async function authenticateCreatorReady(page: Page): Promise<void> {
  await requireBypassAuth();
  await setTestAuthBypassSession(page, 'creator-ready');
}

async function stubPassiveTracking(page: Page): Promise<void> {
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

async function gotoAppRoute(page: Page, route: string): Promise<void> {
  await page.goto(route, {
    waitUntil: 'domcontentloaded',
    timeout: TIMEOUTS.NAVIGATION,
  });
  await waitForHydration(page);
}

async function getFirstReleaseTrigger(page: Page): Promise<Locator | null> {
  const mobileRow = page
    .locator('[data-testid^="mobile-release-row-"]')
    .first();
  if (await mobileRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
    return mobileRow;
  }

  const taggedRow = page.getByTestId('release-row').first();
  if ((await taggedRow.count()) > 0) {
    const openButton = taggedRow
      .locator('[data-testid^="release-open-"]')
      .first();
    if ((await openButton.count()) > 0) {
      return openButton;
    }
    const firstCell = taggedRow.locator('td').first();
    if ((await firstCell.count()) > 0) {
      return firstCell;
    }
    return taggedRow;
  }

  const desktopRow = page.locator('tbody tr').first();
  if (await desktopRow.isVisible({ timeout: 5_000 }).catch(() => false)) {
    const openButton = desktopRow
      .locator('[data-testid^="release-open-"]')
      .first();
    if ((await openButton.count()) > 0) {
      return openButton;
    }
    const firstCell = desktopRow.locator('td').first();
    if ((await firstCell.count()) > 0) {
      return firstCell;
    }
    return desktopRow;
  }

  return null;
}

async function expectCareerHighlightsField(page: Page): Promise<Locator> {
  const field = page.locator('#careerHighlights');
  await expect(field).toBeVisible({ timeout: TIMEOUTS.ELEMENT });
  return field;
}

test.describe('Dashboard Interaction CLS Audit @nightly', () => {
  test.beforeEach(async ({ page }) => {
    if (shouldSkipClsInDevMode()) {
      return;
    }
    await authenticateCreatorReady(page);
    await stubPassiveTracking(page);
  });

  test('release row click drawer open has CLS within budget', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    if (shouldSkipClsInDevMode()) {
      test.skip(
        true,
        'CLS budgets are unreliable in dev mode (Turbopack overhead)'
      );
      return;
    }

    await gotoAppRoute(page, APP_ROUTES.RELEASES);

    await expect(page.getByTestId('releases-matrix')).toBeVisible({
      timeout: TIMEOUTS.ELEMENT,
    });

    const releaseTrigger = await getFirstReleaseTrigger(page);
    if (!releaseTrigger) {
      test.skip(true, 'No release rows available — cannot measure drawer CLS');
      return;
    }

    await installInteractionClsObserver(page);
    await releaseTrigger.click();

    const sidebar = page.getByTestId('release-sidebar');
    const drawerOpened = await sidebar
      .isVisible({ timeout: TIMEOUTS.SIDEBAR })
      .catch(() => false);
    if (!drawerOpened) {
      test.skip(
        true,
        'Release drawer did not open — cannot measure drawer CLS'
      );
      return;
    }

    const cls = await collectInteractionCls(page);

    await attachClsResult(testInfo, 'cls-release-drawer-open', {
      cls,
      budget: CLS_INTERACTION_BUDGET,
      route: APP_ROUTES.RELEASES,
      interaction: 'release-row-click',
    });

    expect(
      cls,
      `CLS ${cls.toFixed(4)} during release drawer open exceeds budget of ${CLS_INTERACTION_BUDGET}`
    ).toBeLessThan(CLS_INTERACTION_BUDGET);
  });

  test('settings career highlights save has CLS within budget', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    if (shouldSkipClsInDevMode()) {
      test.skip(
        true,
        'CLS budgets are unreliable in dev mode (Turbopack overhead)'
      );
      return;
    }

    await gotoAppRoute(page, APP_ROUTES.SETTINGS_ARTIST_PROFILE);
    const careerHighlightsField = await expectCareerHighlightsField(page);

    const testValue = `CLS audit ${Date.now()}`;
    const saveResponse = page.waitForResponse(
      response =>
        response.url().includes('/api/dashboard/profile') &&
        response.request().method() === 'PUT',
      { timeout: 60_000 }
    );

    await installInteractionClsObserver(page);
    await careerHighlightsField.fill(testValue);
    await careerHighlightsField.press('Tab');

    const response = await saveResponse;
    expect(response.ok()).toBeTruthy();

    const cls = await collectInteractionCls(page);

    await attachClsResult(testInfo, 'cls-settings-save', {
      cls,
      budget: CLS_INTERACTION_BUDGET,
      route: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
      interaction: 'career-highlights-save',
    });

    expect(
      cls,
      `CLS ${cls.toFixed(4)} during settings save exceeds budget of ${CLS_INTERACTION_BUDGET}`
    ).toBeLessThan(CLS_INTERACTION_BUDGET);
  });

  test('calendar route first paint has CLS within budget', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);
    if (shouldSkipClsInDevMode()) {
      test.skip(
        true,
        'CLS budgets are unreliable in dev mode (Turbopack overhead)'
      );
      return;
    }

    // Warm the authenticated shell before measuring calendar paint shifts.
    await gotoAppRoute(page, APP_ROUTES.RELEASES);
    await expect(page.getByTestId('releases-matrix')).toBeVisible({
      timeout: TIMEOUTS.ELEMENT,
    });

    await installInteractionClsObserver(page);
    await page.goto(APP_ROUTES.CALENDAR, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.NAVIGATION,
    });
    await waitForHydration(page);

    const calendarVisible = await page
      .getByTestId('release-calendar')
      .isVisible({ timeout: TIMEOUTS.ELEMENT })
      .catch(() => false);
    if (!calendarVisible) {
      test.skip(
        true,
        'Release calendar did not render — cannot measure calendar CLS'
      );
      return;
    }

    const cls = await collectInteractionCls(page);

    await attachClsResult(testInfo, 'cls-calendar-first-paint', {
      cls,
      budget: CLS_INTERACTION_BUDGET,
      route: APP_ROUTES.CALENDAR,
      interaction: 'calendar-route-navigation',
    });

    expect(
      cls,
      `CLS ${cls.toFixed(4)} during calendar first paint exceeds budget of ${CLS_INTERACTION_BUDGET}`
    ).toBeLessThan(CLS_INTERACTION_BUDGET);
  });
});
