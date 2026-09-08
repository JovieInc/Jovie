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

import { expect, type Locator, type Page, test } from '@playwright/test';
import { SMOKE_TIMEOUTS, waitForHydration } from './utils/smoke-test-utils';

/** The cookie name the middleware uses to flag consent-required regions */
const CONSENT_REQUIRED_COOKIE = 'jv_cc_required';

// Run as anonymous visitor with no stored auth or consent
test.use({ storageState: { cookies: [], origins: [] } });

async function openHomepageWithBanner(
  page: import('@playwright/test').Page
): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3100';

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

function boxesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

/** Verify the visible face separately from actual pointer ownership outside it. */
async function assertConsentActions(
  page: Page,
  actions: Locator[],
  enlarged = false
) {
  const targets = [];
  for (const action of actions) {
    await expect(action).toBeVisible();
    // Finish finite entrance transforms on the modal and its ancestors first.
    await action.evaluate(async element => {
      const pending: Promise<unknown>[] = [];
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        for (const animation of node.getAnimations()) {
          if (
            animation.playState === 'running' &&
            Number.isFinite(
              Number(animation.effect?.getComputedTiming().endTime)
            )
          ) {
            pending.push(animation.finished);
          }
        }
      }
      await Promise.all(pending);
    });
    const geometry = await action.evaluate(element => {
      const face = element.getBoundingClientRect();
      const pseudo = getComputedStyle(element, '::before');
      const width = Math.max(face.width, Number.parseFloat(pseudo.width));
      const height = Math.max(face.height, Number.parseFloat(pseudo.height));
      const x = face.x + (face.width - width) / 2;
      const y = face.y + (face.height - height) / 2;
      const points = [
        [x + width / 2, y + 2],
        [x + width / 2, y + height - 2],
        [x + 2, y + height / 2],
        [x + width - 2, y + height / 2],
      ];
      return {
        x,
        y,
        width,
        height,
        faceHeight: face.height,
        owned: points.every(([px, py]) => {
          const hit = document.elementFromPoint(px, py);
          return hit === element || (hit !== null && element.contains(hit));
        }),
      };
    });
    if (enlarged) expect(geometry.faceHeight).toBeGreaterThan(28);
    else expect(geometry.faceHeight).toBeCloseTo(28, 0);
    expect(geometry.width).toBeGreaterThanOrEqual(44);
    expect(geometry.height).toBeGreaterThanOrEqual(44);
    expect(geometry.owned, 'target edges must hit their own action').toBe(true);
    targets.push(geometry);
    await page.keyboard.press('Tab');
    await action.focus();
    await expect(action).toBeFocused();
    await expect
      .poll(() =>
        action.evaluate(element => getComputedStyle(element).boxShadow)
      )
      .toContain('rgb(37, 99, 255)');
  }
  for (let i = 0; i < targets.length; i += 1) {
    for (const other of targets.slice(i + 1)) {
      expect(boxesOverlap(targets[i], other), 'consent targets overlap').toBe(
        false
      );
    }
  }
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

    await assertConsentActions(
      page,
      ['Reject all', 'Customize', 'Accept all'].map(name =>
        banner.getByRole('button', { name, exact: true })
      )
    );
  });

  for (const viewport of [
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`cookie overlay preserves the homepage primary path on ${viewport.name}`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      await openHomepageWithBanner(page);

      const banner = page.getByTestId('cookie-banner');
      const findMe = page.getByTestId('homepage-primary-cta');
      await expect(banner).toBeVisible({
        timeout: SMOKE_TIMEOUTS.VISIBILITY,
      });
      await expect(findMe).toBeVisible();

      const bannerBox = await banner.boundingBox();
      const findMeBox = await findMe.boundingBox();
      expect(bannerBox).not.toBeNull();
      expect(findMeBox).not.toBeNull();
      expect(
        boxesOverlap(bannerBox!, findMeBox!),
        `Cookie banner overlaps Find me at ${viewport.width}x${viewport.height}`
      ).toBe(false);

      if (viewport.name === 'mobile') {
        const menuButton = page.getByRole('button', { name: 'Open menu' });
        await expect(menuButton).toBeVisible();
        await menuButton.click();
        const mobileNav = page.locator('#mobile-nav-panel');
        await expect(mobileNav).toBeVisible();
        await expect(
          mobileNav.getByRole('link', { name: 'Get started', exact: true })
        ).toBeVisible();
      }
    });
  }

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

    await assertConsentActions(page, [acceptBtn]);

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

  for (const width of [1280, 390]) {
    test(`Customize opens canonical modal actions at ${width}px`, async ({
      page,
    }) => {
      test.setTimeout(90_000);

      await page.setViewportSize({ width, height: 844 });
      await openHomepageWithBanner(page);

      const banner = page.locator('[data-testid="cookie-banner"]');
      await expect(banner).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

      const customizeBtn = banner.getByRole('button', { name: 'Customize' });
      await expect(
        customizeBtn,
        '"Customize" button not found in cookie banner'
      ).toBeVisible({ timeout: SMOKE_TIMEOUTS.VISIBILITY });

      await assertConsentActions(page, [customizeBtn]);

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

      const cancelBtn = page.getByRole('button', {
        name: 'Cancel',
        exact: true,
      });
      await assertConsentActions(page, [cancelBtn, saveBtn]);

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
      for (const action of [cancelBtn, saveBtn]) {
        await action.evaluate(element => {
          element.style.fontSize = '24px';
        });
      }
      await assertConsentActions(page, [cancelBtn, saveBtn], true);
    });
  }
});
