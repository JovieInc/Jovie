/**
 * E2E smoke: Cookie banner P0 health checks (JOV-2074).
 *
 * Covers:
 *   - cookie banner appears for new visitors (requires jv_cc_required=1)
 *   - "Accept all" and "Reject all" are same-layer, equally prominent, and clickable
 *   - "Customize" button opens the modal which contains "Save Preferences"
 *
 * The banner is only rendered when `jv_cc_required=1` cookie is present
 * (set by middleware for EU/EEA visitors). For smoke purposes we set it
 * programmatically via addCookies so the test is deterministic.
 *
 * Run:
 *   doppler run -- pnpm --filter web exec playwright test cookies.spec --project=chromium
 *
 * @smoke
 */

import { expect, test } from '@playwright/test';
import { primeVercelBypassCookie } from '../helpers/vercel-preview';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/** The cookie name the middleware uses to flag consent-required regions */
const CONSENT_REQUIRED_COOKIE = 'jv_cc_required';

// Run as anonymous visitor with no stored auth or consent
test.use({ storageState: { cookies: [], origins: [] } });

async function openHomepageWithBanner(
  page: import('@playwright/test').Page
): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';
  await primeVercelBypassCookie(page, baseUrl);

  // Remove stored consent so the banner renders even on repeat runs
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('jv_cc');
    } catch {
      // ignore
    }
  });

  // Middleware refreshes the region flag on every request. Send the same
  // deterministic EU geo signal used by production edge requests so it cannot
  // overwrite the fixture cookie with a non-consent region during navigation.
  await page.setExtraHTTPHeaders({
    'x-vercel-ip-country': 'DE',
    'x-vercel-ip-country-region': 'BE',
  });

  // Set the middleware-controlled cookie that enables the banner
  await page.context().addCookies([
    {
      name: CONSENT_REQUIRED_COOKIE,
      value: '1',
      url: baseUrl,
      sameSite: 'Lax',
    },
  ]);

  await page.route('**/api/profile/view', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/audience/visit', r =>
    r.fulfill({ status: 200, body: '{}' })
  );
  await page.route('**/api/track', r => r.fulfill({ status: 200, body: '{}' }));

  await page.goto('/', {
    waitUntil: 'domcontentloaded',
    timeout: SMOKE_TIMEOUTS.NAVIGATION,
  });
  await waitForHydration(page);
}

test.describe('Cookie banner @smoke', () => {
  test('cookie banner appears for new visitors', async ({ page }) => {
    test.setTimeout(90_000);

    await openHomepageWithBanner(page);

    const banner = page.locator('[data-testid="cookie-banner"]');

    await expect(
      banner,
      'Cookie banner did not appear — banner rendering is broken'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    // Banner must have a nonzero bounding box (not invisible/zero-sized)
    const box = await banner.boundingBox();
    expect(box, 'Cookie banner has no bounding box').not.toBeNull();
    expect(box!.width, 'Cookie banner has zero width').toBeGreaterThan(0);
    expect(box!.height, 'Cookie banner has zero height').toBeGreaterThan(0);

    for (const actionName of ['Reject all', 'Customize', 'Accept all']) {
      const actionBox = await banner
        .getByRole('button', { name: actionName, exact: true })
        .boundingBox();
      expect(actionBox, `${actionName} has no bounding box`).not.toBeNull();
      expect(
        actionBox!.width,
        `${actionName} misses the 44px touch width`
      ).toBeGreaterThanOrEqual(44);
      expect(
        actionBox!.height,
        `${actionName} misses the 44px touch height`
      ).toBeGreaterThanOrEqual(44);
    }
  });

  test('visible consent stays clear of the homepage primary action from 320px through desktop', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.setViewportSize({ width: 320, height: 568 });
    await page.addInitScript(() => {
      const target = window as Window & { __cookieBannerCls?: number };
      target.__cookieBannerCls = 0;
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            hadRecentInput: boolean;
            value: number;
          };
          if (!shift.hadRecentInput) {
            target.__cookieBannerCls =
              (target.__cookieBannerCls ?? 0) + shift.value;
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.addInitScript(() => {
      document.cookie = 'jv_cc_required=1; path=/; SameSite=Lax';
    });
    await openHomepageWithBanner(page);

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.evaluate(
        () =>
          new Promise<void>(resolve =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );

      const banner = page.getByTestId('cookie-banner');
      const primaryAction = page.getByTestId('homepage-editorial-hero-search');
      await expect(banner).toBeVisible();
      await expect(primaryAction).toBeVisible();

      const [bannerBox, primaryActionBox] = await Promise.all([
        banner.boundingBox(),
        primaryAction.boundingBox(),
      ]);
      expect(bannerBox, `${viewport.width}px banner has no box`).not.toBeNull();
      expect(
        primaryActionBox,
        `${viewport.width}px primary action has no box`
      ).not.toBeNull();
      expect(
        bannerBox!.y >= primaryActionBox!.y + primaryActionBox!.height ||
          primaryActionBox!.y >= bannerBox!.y + bannerBox!.height,
        `${viewport.width}px consent banner overlaps the homepage primary action`
      ).toBe(true);
    }

    await page.setViewportSize({ width: 320, height: 568 });
    const heroInput = page.getByPlaceholder('Search your name').first();
    const heroSubmit = page.getByRole('button', { name: 'Find me' }).first();
    await heroInput.focus();
    await page.keyboard.press('Tab');
    await expect(heroSubmit).toBeFocused();
    expect(
      await heroSubmit.evaluate(element => element.matches(':focus-visible'))
    ).toBe(true);

    const banner = page.getByTestId('cookie-banner');
    await banner.getByRole('link', { name: 'Privacy' }).focus();
    for (const actionName of ['Reject all', 'Accept all', 'Customize']) {
      await page.keyboard.press('Tab');
      const action = banner.getByRole('button', {
        name: actionName,
        exact: true,
      });
      await expect(action).toBeFocused();
      expect(
        await action.evaluate(element => element.matches(':focus-visible'))
      ).toBe(true);
    }

    expect(
      await page.evaluate(
        () =>
          (window as Window & { __cookieBannerCls?: number })
            .__cookieBannerCls ?? 0
      )
    ).toBeLessThanOrEqual(0.01);
  });

  test('Accept all button is clickable and persists every optional category', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await openHomepageWithBanner(page);

    const banner = page.locator('[data-testid="cookie-banner"]');
    await expect(banner).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    // Floating-card actions stay directly available at every breakpoint.
    const acceptBtn = banner.getByRole('button', { name: 'Accept all' });

    await expect(
      acceptBtn,
      '"Accept all" button not found in cookie banner'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    const box = await acceptBtn.boundingBox();
    expect(box, '"Accept all" button has no bounding box').not.toBeNull();
    expect(
      box!.width,
      '"Accept all" button misses 44px touch width'
    ).toBeGreaterThanOrEqual(44);
    expect(
      box!.height,
      '"Accept all" button misses 44px touch height'
    ).toBeGreaterThanOrEqual(44);

    await acceptBtn.click();
    await expect(banner).toBeHidden({ timeout: 5_000 });
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('jv_cc');
          return raw ? JSON.parse(raw) : null;
        })
      )
      .toMatchObject({
        essential: true,
        analytics: true,
        marketing: true,
      });
  });

  test('Reject all button is clickable and leaves only essential consent', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await openHomepageWithBanner(page);

    const banner = page.locator('[data-testid="cookie-banner"]');
    await expect(banner).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    const rejectBtn = banner.getByRole('button', { name: 'Reject all' });
    await expect(
      rejectBtn,
      '"Reject all" button not found in cookie banner'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    const acceptBtn = banner.getByRole('button', { name: 'Accept all' });
    const rejectBox = await rejectBtn.boundingBox();
    const acceptBox = await acceptBtn.boundingBox();
    expect(rejectBox, '"Reject all" button has no bounding box').not.toBeNull();
    expect(acceptBox, '"Accept all" button has no bounding box').not.toBeNull();
    expect(rejectBox!.height, '"Reject all" is shorter than Accept all').toBe(
      acceptBox!.height
    );
    expect(
      Math.abs(rejectBox!.width - acceptBox!.width),
      'Accept all and Reject all widths are not comparable'
    ).toBeLessThanOrEqual(8);

    await rejectBtn.click();
    await expect(banner).toBeHidden({ timeout: 5_000 });
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('jv_cc');
          return raw ? JSON.parse(raw) : null;
        })
      )
      .toMatchObject({
        essential: true,
        analytics: false,
        marketing: false,
      });
  });

  test('Customize button opens modal with Save Preferences button', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await openHomepageWithBanner(page);

    const banner = page.locator('[data-testid="cookie-banner"]');
    await expect(banner).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    const customizeBtn = banner.getByRole('button', { name: 'Customize' });
    await expect(
      customizeBtn,
      '"Customize" button not found in cookie banner'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    const custBox = await customizeBtn.boundingBox();
    expect(custBox, '"Customize" button has no bounding box').not.toBeNull();
    expect(
      custBox!.width,
      '"Customize" button misses 44px touch width'
    ).toBeGreaterThanOrEqual(44);
    expect(
      custBox!.height,
      '"Customize" button misses 44px touch height'
    ).toBeGreaterThanOrEqual(44);

    // Open the cookie modal
    await customizeBtn.click();

    // The modal should surface a "Save Preferences" button
    // (CookieModal renders a save/confirm action)
    const saveBtn = page
      .getByRole('button', { name: /save preferences|save/i })
      .first();
    await expect(
      saveBtn,
      '"Save Preferences" button did not appear after clicking Customize'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    // Dialog scale-in briefly transforms the visual box below its settled CSS
    // size. Evaluate the stable interaction state, not an animation frame.
    await expect
      .poll(async () => (await saveBtn.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);

    const saveBox = await saveBtn.boundingBox();
    expect(
      saveBox,
      '"Save Preferences" button has no bounding box'
    ).not.toBeNull();
    expect(
      saveBox!.width,
      '"Save Preferences" button misses 44px touch width'
    ).toBeGreaterThanOrEqual(44);
    expect(
      saveBox!.height,
      '"Save Preferences" button misses 44px touch height'
    ).toBeGreaterThanOrEqual(44);

    const cancelBtn = page.getByRole('button', { name: 'Cancel', exact: true });
    const cancelBox = await cancelBtn.boundingBox();
    expect(cancelBox, '"Cancel" button has no bounding box').not.toBeNull();
    expect(cancelBox!.width).toBeGreaterThanOrEqual(44);
    expect(cancelBox!.height).toBeGreaterThanOrEqual(44);

    const analyticsSwitch = page.getByRole('switch', { name: /analytics/i });
    const switchHitArea = await analyticsSwitch.evaluate(control => {
      const pseudo = getComputedStyle(control, '::before');
      return {
        width: Number.parseFloat(pseudo.width),
        height: Number.parseFloat(pseudo.height),
      };
    });
    expect(switchHitArea.width).toBeGreaterThanOrEqual(44);
    expect(switchHitArea.height).toBeGreaterThanOrEqual(44);

    await analyticsSwitch.focus();
    await page.keyboard.press('Space');
    await expect(analyticsSwitch).toBeChecked();
  });
});
