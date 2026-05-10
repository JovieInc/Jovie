/**
 * E2E smoke: Cookie banner P0 health checks (JOV-2074).
 *
 * Covers:
 *   - cookie banner appears for new visitors (requires jv_cc_required=1)
 *   - "Accept All" button is clickable (has nonzero bounding box)
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
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/** The cookie name the middleware uses to flag consent-required regions */
const CONSENT_REQUIRED_COOKIE = 'jv_cc_required';

// Run as anonymous visitor with no stored auth or consent
test.use({ storageState: { cookies: [], origins: [] } });

async function openHomepageWithBanner(
  page: import('@playwright/test').Page
): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';

  // Remove stored consent so the banner renders even on repeat runs
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('jv_cc');
    } catch {
      // ignore
    }
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
  });

  test('Accept All button is clickable and has nonzero bounding box', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await openHomepageWithBanner(page);

    const banner = page.locator('[data-testid="cookie-banner"]');
    await expect(banner).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    // On mobile viewports the actions area is hidden until "Manage" is clicked.
    // At desktop width (1280px default) the actions are always visible.
    const acceptBtn = banner.getByRole('button', { name: 'Accept All' });

    await expect(
      acceptBtn,
      '"Accept All" button not found in cookie banner'
    ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

    const box = await acceptBtn.boundingBox();
    expect(box, '"Accept All" button has no bounding box').not.toBeNull();
    expect(box!.width, '"Accept All" button has zero width').toBeGreaterThan(0);
    expect(box!.height, '"Accept All" button has zero height').toBeGreaterThan(
      0
    );

    // Clicking must not throw and must dismiss the banner
    await acceptBtn.click();
    await expect(banner).toBeHidden({ timeout: 5_000 });
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
    expect(custBox!.width, '"Customize" button has zero width').toBeGreaterThan(
      0
    );
    expect(
      custBox!.height,
      '"Customize" button has zero height'
    ).toBeGreaterThan(0);

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

    const saveBox = await saveBtn.boundingBox();
    expect(
      saveBox,
      '"Save Preferences" button has no bounding box'
    ).not.toBeNull();
    expect(
      saveBox!.width,
      '"Save Preferences" button has zero width'
    ).toBeGreaterThan(0);
    expect(
      saveBox!.height,
      '"Save Preferences" button has zero height'
    ).toBeGreaterThan(0);
  });
});
